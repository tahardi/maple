import { appendFileSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IPty, spawn } from 'node-pty';
import { spawn as childSpawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LocalRunner } from './localRunner';

describe('LocalRunner', () => {
  let dir = '';
  const stops: (() => void)[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-local-runner-'));
  });

  afterEach(async () => {
    for (const stop of stops.splice(0)) {
      stop();
    }
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  test('exec runs in cwd and returns the exit code', async () => {
    // given
    const runner = new LocalRunner();
    // when
    const result = await runner.exec(['sh', '-c', 'printf %s "$PWD"; exit 3'], { cwd: dir });
    // then
    expect(result).toEqual({ stdout: realpathSync(dir), stderr: '', code: 3 });
  });

  test('exec pipes input', async () => {
    // given
    const runner = new LocalRunner();
    // when
    const result = await runner.exec(['cat'], { input: 'x\ny' });
    // then
    expect(result.stdout).toBe('x\ny');
  });

  test('exec returns 127 for a missing program', async () => {
    // given
    const runner = new LocalRunner();
    // when
    const result = await runner.exec(['maple-no-such-tool']);
    // then
    expect(result.code).toBe(127);
  });

  test('exec returns 127 for a missing cwd', async () => {
    // given
    const runner = new LocalRunner();
    // when
    const result = await runner.exec(['cat'], { cwd: join(dir, 'missing') });
    // then
    expect(result.code).toBe(127);
  });

  test('exec rejects when output passes maxBuffer', async () => {
    // given
    const runner = new LocalRunner();
    // when
    const running = runner.exec(['sh', '-c', 'printf 12345'], { maxBuffer: 4 });
    // then
    await expect(running).rejects.toThrow('running command: output exceeds 4 bytes');
  });

  test('readFile returns bytes and throws ENOENT for a missing file', async () => {
    // given
    const runner = new LocalRunner();
    const path = join(dir, 'bytes');
    await writeFile(path, Buffer.from([0, 1, 2]));
    // when
    const bytes = await runner.readFile(path);
    const missing = runner.readFile(join(dir, 'missing'));
    // then
    expect(bytes).toEqual(Buffer.from([0, 1, 2]));
    await expect(missing).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('follow emits appended lines', async () => {
    // given
    const runner = new LocalRunner();
    const path = join(dir, 'log');
    writeFileSync(path, '');
    const lines: string[] = [];
    stops.push(runner.follow(path, (line) => lines.push(line)));
    // when
    const appending = setInterval(() => {
      appendFileSync(path, 'one\ntwo\n');
    }, 200);
    // then
    try {
      await vi.waitFor(
        () => {
          expect(lines.slice(0, 2)).toEqual(['one', 'two']);
        },
        { timeout: 10_000 },
      );
    } finally {
      clearInterval(appending);
    }
  });

  test('follow emits nothing after stop', async () => {
    // given
    const runner = new LocalRunner();
    const path = join(dir, 'log');
    writeFileSync(path, '');
    const lines: string[] = [];
    const stop = runner.follow(path, (line) => lines.push(line));
    // when
    stop();
    await new Promise((resolve) => setTimeout(resolve, 200));
    appendFileSync(path, 'late\n');
    await new Promise((resolve) => setTimeout(resolve, 200));
    // then
    expect(lines).toEqual([]);
  });

  test('spawnPty starts the command with the env merged over the parent env', () => {
    // given
    vi.stubEnv('CLAUDE_CODE_CHILD_SESSION', '1');
    vi.stubEnv('MAPLE_TAB_ID', 'from-parent');
    const pty = {} as IPty;
    const spawnPty = vi.fn<typeof spawn>(() => pty);
    const runner = new LocalRunner({ spawn: childSpawn, spawnPty });
    // when
    const result = runner.spawnPty(['bash', '-l'], { cwd: '/w', env: { MAPLE_TAB_ID: 't1' }, cols: 80, rows: 24 });
    // then
    expect(result).toBe(pty);
    const [file, args, options] = spawnPty.mock.calls[0];
    expect(file).toBe('bash');
    expect(args).toEqual(['-l']);
    expect(options).toMatchObject({ name: 'xterm-256color', cols: 80, rows: 24, cwd: '/w' });
    expect(options.env).toMatchObject({ MAPLE_TAB_ID: 't1', TERM: 'xterm-256color' });
    expect(options.env).not.toHaveProperty('CLAUDE_CODE_CHILD_SESSION');
  });
});
