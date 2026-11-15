import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RemoteConfig } from '@shared/types/config/remoteConfig';
import { collect, followLines, vmHome } from './runner';

type FakeChild = EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => void };

function fakeChild(stdout: string | Buffer, code: number, stderr = ''): FakeChild {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
  child.stdout.end(stdout);
  child.stderr.end(stderr);
  setImmediate(() => child.emit('close', code));
  return child;
}

function openChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
}

function asChild(child: FakeChild): ChildProcessWithoutNullStreams {
  return child as unknown as ChildProcessWithoutNullStreams;
}

describe('collect', () => {
  test('returns stdout bytes, stderr text, and the exit code', async () => {
    // given
    const bytes = Buffer.from([0x61, 0x00, 0x62]);
    const child = fakeChild(bytes, 3, 'warn');
    // when
    const result = await collect(asChild(child), undefined, 1024);
    // then
    expect(result).toEqual({ stdout: bytes, stderr: 'warn', code: 3 });
  });

  test('writes input to stdin and closes it', async () => {
    // given
    const child = fakeChild('', 0);
    const chunks: Buffer[] = [];
    child.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    // when
    await collect(asChild(child), 'hello', 1024);
    // then
    expect(Buffer.concat(chunks).toString('utf8')).toBe('hello');
    expect(child.stdin.writableEnded).toBe(true);
  });

  test('maps a spawn ENOENT error to code 127', async () => {
    // given
    const child = openChild();
    setImmediate(() => child.emit('error', Object.assign(new Error('spawn x ENOENT'), { code: 'ENOENT' })));
    // when
    const result = await collect(asChild(child), undefined, 1024);
    // then
    expect(result).toEqual({ stdout: Buffer.alloc(0), stderr: 'spawn x ENOENT', code: 127 });
  });

  test('rejects and kills the child when stdout passes maxBuffer', async () => {
    // given
    const child = fakeChild('12345', 0);
    // when
    const result = collect(asChild(child), undefined, 4);
    // then
    await expect(result).rejects.toThrow('running command: output exceeds 4 bytes');
    expect(child.kill).toHaveBeenCalled();
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
    const child = openChild();
    const lines: string[] = [];
    followLines(
      () => asChild(child),
      (line) => lines.push(line),
    );
    // when
    child.stdout.emit('data', Buffer.from('a\nb'));
    child.stdout.emit('data', Buffer.from('c\n'));
    // then
    expect(lines).toEqual(['a', 'bc']);
  });

  test('restarts 5 seconds after the child closes', () => {
    // given
    const start = vi.fn(() => asChild(openChild()));
    followLines(start, () => undefined);
    const first = start.mock.results[0].value as EventEmitter;
    // when
    first.emit('close', 0);
    vi.advanceTimersByTime(5000);
    // then
    expect(start).toHaveBeenCalledTimes(2);
  });

  test('stop kills the child and never restarts', () => {
    // given
    const child = openChild();
    const start = vi.fn(() => asChild(child));
    const stop = followLines(start, () => undefined);
    // when
    stop();
    child.emit('close', null);
    vi.advanceTimersByTime(10_000);
    // then
    expect(child.kill).toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('vmHome', () => {
  const remote: RemoteConfig = {
    host: '192.168.150.10',
    user: 'root',
    keyPath: '/k/id',
    knownHostsPath: '/k/known_hosts',
    vaultSocket: null,
  };

  test.each([
    { name: 'the desktop home without remote', remote: null, want: homedir() },
    { name: '/home/<user> with remote', remote: { ...remote, user: 'dev' }, want: '/home/dev' },
  ])('is $name', ({ remote, want }) => {
    // given
    const config = remote;
    // when
    const home = vmHome(config);
    // then
    expect(home).toBe(want);
  });
});
