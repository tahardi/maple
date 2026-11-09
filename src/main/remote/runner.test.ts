import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RemoteConfig } from '@shared/types/config';
import { collect, FOLLOW_RESTART_MS, followLines, MAX_FOLLOW_LINE, vmHome } from './runner';

function idleChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
}

function fakeChild(stdout: string | Buffer, code: number, stderr = '') {
  const child = idleChild();
  child.stdout.end(stdout);
  child.stderr.end(stderr);
  setImmediate(() => child.emit('close', code));
  return child;
}

function asChild(child: ReturnType<typeof idleChild>): ChildProcessWithoutNullStreams {
  return child as unknown as ChildProcessWithoutNullStreams;
}

describe('collect', () => {
  test('returns stdout bytes, stderr text, and the exit code', async () => {
    // given
    const bytes = Buffer.from([0x61, 0x00, 0x62]);
    const child = fakeChild(bytes, 3, 'warn');
    // when
    const result = await collect(asChild(child), undefined, 100);
    // then
    expect(result).toEqual({ stdout: bytes, stderr: 'warn', code: 3 });
  });

  test('writes input to stdin and closes it', async () => {
    // given
    const child = fakeChild('', 0);
    // when
    await collect(asChild(child), 'hello', 100);
    // then
    expect(String(child.stdin.read())).toBe('hello');
    expect(child.stdin.writableEnded).toBe(true);
  });

  test('closes stdin when there is no input', async () => {
    // given
    const child = fakeChild('', 0);
    // when
    await collect(asChild(child), undefined, 100);
    // then
    expect(child.stdin.writableEnded).toBe(true);
  });

  test.each([
    { name: 'ENOENT to code 127', code: 'ENOENT', expected: 127 },
    { name: 'other errors to code 1', code: 'EACCES', expected: 1 },
  ])('maps a spawn $name', async ({ code, expected }) => {
    // given
    const child = idleChild();
    const collected = collect(asChild(child), undefined, 100);
    // when
    child.emit('error', Object.assign(new Error(`spawn x ${code}`), { code }));
    const result = await collected;
    // then
    expect(result).toEqual({ stdout: Buffer.alloc(0), stderr: `spawn x ${code}`, code: expected });
  });

  test('uses code 1 when the child closes without an exit code', async () => {
    // given
    const child = idleChild();
    const collected = collect(asChild(child), undefined, 100);
    // when
    child.emit('close', null);
    const result = await collected;
    // then
    expect(result.code).toBe(1);
  });

  test.each([
    { name: 'stdout', stdout: '12345', stderr: '' },
    { name: 'stderr', stdout: '', stderr: '12345' },
    { name: 'stdout and stderr together', stdout: '123', stderr: '45' },
  ])('rejects and kills the child when $name passes maxBuffer', async ({ stdout, stderr }) => {
    // given
    const child = fakeChild(stdout, 0, stderr);
    // when
    const collected = collect(asChild(child), undefined, 4);
    // then
    await expect(collected).rejects.toThrow('running command: output exceeds 4 bytes');
    expect(child.kill).toHaveBeenCalled();
  });

  test('resolves when output is exactly maxBuffer', async () => {
    // given
    const child = fakeChild('1234', 0);
    // when
    const result = await collect(asChild(child), undefined, 4);
    // then
    expect(result.stdout.toString()).toBe('1234');
  });

  test('survives a stdin error when the child exits before reading', async () => {
    // given
    const child = fakeChild('', 0);
    const collected = collect(asChild(child), 'hello', 100);
    // when
    child.stdin.emit('error', new Error('write EPIPE'));
    const result = await collected;
    // then
    expect(result.code).toBe(0);
  });
});

describe('followLines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('emits whole lines across chunks', () => {
    // given
    const child = idleChild();
    const lines: string[] = [];
    followLines(
      () => asChild(child),
      (line) => lines.push(line),
    );
    // when
    child.stdout.emit('data', 'a\nb');
    child.stdout.emit('data', 'c\n');
    // then
    expect(lines).toEqual(['a', 'bc']);
  });

  test('restarts 5 seconds after the child closes', () => {
    // given
    const child = idleChild();
    const start = vi.fn(() => asChild(child));
    followLines(start, vi.fn());
    // when
    child.emit('close', 0);
    vi.advanceTimersByTime(FOLLOW_RESTART_MS);
    // then
    expect(start).toHaveBeenCalledTimes(2);
  });

  test('drops a partial line when the child restarts', () => {
    // given
    const children = [idleChild(), idleChild()];
    let started = 0;
    const lines: string[] = [];
    followLines(
      () => asChild(children[started++]),
      (line) => lines.push(line),
    );
    // when
    children[0].stdout.emit('data', 'partial');
    children[0].emit('close', 0);
    vi.advanceTimersByTime(FOLLOW_RESTART_MS);
    children[1].stdout.emit('data', 'whole\n');
    // then
    expect(lines).toEqual(['whole']);
  });

  test('decodes a character split across chunks', async () => {
    // given
    const child = idleChild();
    const lines: string[] = [];
    followLines(
      () => asChild(child),
      (line) => lines.push(line),
    );
    // when
    child.stdout.write(Buffer.from([0xe2, 0x82]));
    child.stdout.write(Buffer.from([0xac, 0x0a]));
    await vi.waitFor(() => {
      expect(lines).toHaveLength(1);
    });
    // then
    expect(lines).toEqual(['€']);
  });

  test('drops a line past the limit and keeps the next one', () => {
    // given
    const child = idleChild();
    const lines: string[] = [];
    followLines(
      () => asChild(child),
      (line) => lines.push(line),
    );
    // when
    child.stdout.emit('data', 'x'.repeat(MAX_FOLLOW_LINE + 1));
    child.stdout.emit('data', 'more of the same line\nnext\n');
    // then
    expect(lines).toEqual(['next']);
  });

  test('keeps a line exactly at the limit', () => {
    // given
    const child = idleChild();
    const lines: string[] = [];
    const whole = 'x'.repeat(MAX_FOLLOW_LINE);
    followLines(
      () => asChild(child),
      (line) => lines.push(line),
    );
    // when
    child.stdout.emit('data', whole);
    child.stdout.emit('data', '\n');
    // then
    expect(lines).toEqual([whole]);
  });

  test('restarts again when the restarted child closes', () => {
    // given
    const children = [idleChild(), idleChild(), idleChild()];
    let started = 0;
    const start = vi.fn(() => asChild(children[started++]));
    followLines(start, vi.fn());
    // when
    children[0].emit('close', 0);
    vi.advanceTimersByTime(FOLLOW_RESTART_MS);
    children[1].emit('close', 0);
    vi.advanceTimersByTime(FOLLOW_RESTART_MS);
    // then
    expect(start).toHaveBeenCalledTimes(3);
  });

  test('stop kills the newest child after a restart', () => {
    // given
    const children = [idleChild(), idleChild()];
    let started = 0;
    const stop = followLines(() => asChild(children[started++]), vi.fn());
    children[0].emit('close', 0);
    vi.advanceTimersByTime(FOLLOW_RESTART_MS);
    // when
    stop();
    // then
    expect(children[1].kill).toHaveBeenCalled();
    expect(children[0].kill).not.toHaveBeenCalled();
  });

  test('stop kills the child and never restarts', () => {
    // given
    const child = idleChild();
    const start = vi.fn(() => asChild(child));
    const stop = followLines(start, vi.fn());
    // when
    stop();
    child.emit('close', 0);
    vi.advanceTimersByTime(10_000);
    // then
    expect(child.kill).toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('stop cancels a pending restart', () => {
    // given
    const child = idleChild();
    const start = vi.fn(() => asChild(child));
    const stop = followLines(start, vi.fn());
    child.emit('close', 0);
    // when
    stop();
    vi.advanceTimersByTime(10_000);
    // then
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('survives a child error event', () => {
    // given
    const child = idleChild();
    followLines(() => asChild(child), vi.fn());
    // when
    const emit = () => child.emit('error', new Error('spawn ssh ENOENT'));
    // then
    expect(emit).not.toThrow();
  });
});

describe('vmHome', () => {
  const remote: RemoteConfig = {
    host: '192.168.150.10',
    user: 'dev',
    keyPath: '/k/id',
    knownHostsPath: '/k/known_hosts',
    vaultSocket: null,
  };

  test.each([
    { name: 'the desktop home without remote', input: null, expected: homedir() },
    { name: '/home/<user> with remote', input: { ...remote, user: 'dev' }, expected: '/home/dev' },
  ])('returns $name', ({ input, expected }) => {
    // given
    const config = input;
    // when
    const home = vmHome(config);
    // then
    expect(home).toBe(expected);
  });
});
