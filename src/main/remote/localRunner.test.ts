import { spawn as childSpawn } from 'node:child_process';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IPty, spawn } from 'node-pty';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LocalRunner } from './localRunner';

describe('LocalRunner', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-runner-'));
  });

  afterEach(async () => {
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

  test('readFile returns bytes and throws ENOENT for a missing file', async () => {
    // given
    const runner = new LocalRunner();
    const path = join(dir, 'f');
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
    await writeFile(path, '');
    const lines: string[] = [];
    // when
    const stop = runner.follow(path, (line) => {
      lines.push(line);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await appendFile(path, 'one\ntwo\n');
    // then
    try {
      await vi.waitFor(() => {
        expect(lines).toEqual(['one', 'two']);
      });
    } finally {
      stop();
    }
  });

  test('spawnPty starts the command with the env merged over the parent env', () => {
    // given
    vi.stubEnv('CLAUDE_CODE_CHILD_SESSION', '1');
    const spawnPty = vi.fn<typeof spawn>(() => ({}) as IPty);
    const runner = new LocalRunner({ spawn: childSpawn, spawnPty });
    // when
    runner.spawnPty(['bash', '-l'], { cwd: '/w', env: { MAPLE_TAB_ID: 't1' }, cols: 80, rows: 24 });
    // then
    expect(spawnPty).toHaveBeenCalledWith('bash', ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: '/w',
      env: expect.objectContaining({ MAPLE_TAB_ID: 't1', TERM: 'xterm-256color' }) as unknown,
    });
    const env = spawnPty.mock.calls[0][2].env ?? {};
    expect(env).not.toHaveProperty('CLAUDE_CODE_CHILD_SESSION');
  });
});
