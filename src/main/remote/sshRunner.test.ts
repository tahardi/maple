import type { ChildProcessWithoutNullStreams, spawn as childSpawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { IPty, spawn as ptySpawn } from 'node-pty';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RemoteConfig } from '@shared/types/config';
import { KEEP_ALIVE_MS, MAX_ERROR_CHARS, remoteCommand, shellQuote, SshRunner } from './sshRunner';

const remote: RemoteConfig = {
  host: '192.168.150.10',
  user: 'dev',
  keyPath: '/k/id',
  knownHostsPath: '/k/known_hosts',
  vaultSocket: '/state/vault.sock',
};
const configDir = '/cfg';
const target = 'dev@192.168.150.10';
const BASE = [
  '-F',
  'none',
  '-i',
  '/k/id',
  '-o',
  'IdentitiesOnly=yes',
  '-o',
  'UserKnownHostsFile=/k/known_hosts',
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  'ControlMaster=auto',
  '-o',
  'ControlPath=/cfg/ssh-%C',
  '-o',
  'ControlPersist=10m',
  '-o',
  'ForwardX11=no',
  '-o',
  'ForwardAgent=no',
  '-o',
  'ServerAliveInterval=15',
  '-o',
  'ServerAliveCountMax=3',
];

function fakeChild(stdout: string | Buffer, code: number, stderr = '') {
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

function setup(stdout: string | Buffer = '', code = 0, stderr = '', config: RemoteConfig = remote) {
  const children: ReturnType<typeof fakeChild>[] = [];
  const spawn = vi.fn(() => {
    const child = fakeChild(stdout, code, stderr);
    children.push(child);
    return child as unknown as ChildProcessWithoutNullStreams;
  });
  const pty = {} as IPty;
  const spawnPty = vi.fn<typeof ptySpawn>(() => pty);
  const runner = new SshRunner(config, configDir, { spawn: spawn as unknown as typeof childSpawn, spawnPty });
  return { runner, spawn, spawnPty, pty, children };
}

describe('shellQuote', () => {
  test.each([
    { input: 'abc', expected: "'abc'" },
    { input: "it's", expected: "'it'\\''s'" },
    { input: '', expected: "''" },
  ])('quotes $input', ({ input, expected }) => {
    // given
    const arg = input;
    // when
    const quoted = shellQuote(arg);
    // then
    expect(quoted).toBe(expected);
  });

  test('survives sh -c as one word', () => {
    // given
    const s = "a b; rm -rf ~ $(x) 'q'";
    // when
    const output = execFileSync('sh', ['-c', `printf %s ${shellQuote(s)}`]).toString();
    // then
    expect(output).toBe(s);
  });
});

describe('remoteCommand', () => {
  test.each<{ name: string; cwd?: string; env?: Record<string, string>; expected: string }>([
    { name: 'a plain command', cwd: undefined, env: undefined, expected: "exec 'git' 'status'" },
    { name: 'a cwd', cwd: '/home/dev/x', env: undefined, expected: "cd '/home/dev/x' && exec 'git' 'status'" },
    {
      name: 'a cwd and env',
      cwd: '/home/dev/x',
      env: { MAPLE_TAB_ID: 't1' },
      expected: "cd '/home/dev/x' && exec env 'MAPLE_TAB_ID=t1' 'git' 'status'",
    },
    { name: 'an empty env', cwd: undefined, env: {}, expected: "exec 'git' 'status'" },
  ])('builds $name', ({ cwd, env, expected }) => {
    // given
    const cmd = ['git', 'status'];
    // when
    const command = remoteCommand(cmd, cwd, env);
    // then
    expect(command).toBe(expected);
  });
});

describe('remoteCommand in a real shell', () => {
  test('keeps quotes in the cwd and env values intact', () => {
    // given
    const dir = mkdtempSync(join(tmpdir(), "maple 'ssh-"));
    const command = remoteCommand(['sh', '-c', 'printf %s "$VALUE|$PWD"'], dir, { VALUE: "a'b $(x)" });
    // when
    const output = execFileSync('sh', ['-c', command]).toString();
    // then
    expect(output).toBe(`a'b $(x)|${realpathSync(dir)}`);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('SshRunner', () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    for (const stop of stops.splice(0)) {
      stop();
    }
    vi.unstubAllEnvs();
  });

  test('exec runs the quoted command over the master connection', async () => {
    // given
    const { runner, spawn } = setup('out', 2, 'err');
    // when
    const result = await runner.exec(['git', 'status'], { cwd: '/home/dev/x' });
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [...BASE, target, '--', "cd '/home/dev/x' && exec 'git' 'status'"]);
    expect(result).toEqual({ stdout: 'out', stderr: 'err', code: 2 });
  });

  test('exec sends input to ssh stdin', async () => {
    // given
    const { runner, children } = setup();
    // when
    await runner.exec(['cat'], { input: 'hello' });
    // then
    expect(String(children[0].stdin.read())).toBe('hello');
  });

  test('exec passes ssh failures through as code 255', async () => {
    // given
    const { runner } = setup('', 255, 'Connection refused');
    // when
    const result = await runner.exec(['git', 'status']);
    // then
    expect(result).toMatchObject({ code: 255, stderr: 'Connection refused' });
  });

  test('exec rejects when output passes maxBuffer', async () => {
    // given
    const { runner } = setup('12345');
    // when
    const running = runner.exec(['cat', 'big'], { maxBuffer: 4 });
    // then
    await expect(running).rejects.toThrow('running command: output exceeds 4 bytes');
  });

  test('readFile returns raw bytes', async () => {
    // given
    const bytes = Buffer.from([0, 1, 2]);
    const { runner, spawn } = setup(bytes);
    // when
    const result = await runner.readFile('/home/dev/f');
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [...BASE, target, '--', "exec 'cat' '--' '/home/dev/f'"]);
    expect(result).toEqual(bytes);
  });

  test('readFile throws ENOENT when the file is missing', async () => {
    // given
    const { runner } = setup('', 1, 'cat: /home/dev/f: No such file or directory');
    // when
    const reading = runner.readFile('/home/dev/f');
    // then
    await expect(reading).rejects.toMatchObject({
      code: 'ENOENT',
      message: 'reading /home/dev/f: cat: /home/dev/f: No such file or directory',
    });
  });

  test('readFile throws a plain error for other failures', async () => {
    // given
    const { runner } = setup('', 255, 'Connection refused\n');
    // when
    const reading = runner.readFile('/home/dev/f');
    // then
    await expect(reading).rejects.toThrow('reading /home/dev/f: Connection refused');
    await expect(reading).rejects.not.toHaveProperty('code');
  });

  test('readFile does not report an ssh failure as a missing file', async () => {
    // given
    const { runner } = setup('', 255, 'Warning: Identity file /k/id not accessible: No such file or directory.');
    // when
    const reading = runner.readFile('/home/dev/f');
    // then
    await expect(reading).rejects.toThrow('reading /home/dev/f: Warning: Identity file');
    await expect(reading).rejects.not.toHaveProperty('code');
  });

  test('readFile caps ssh error text', async () => {
    // given
    const { runner } = setup('', 255, 'x'.repeat(MAX_ERROR_CHARS + 1));
    // when
    const reading = runner.readFile('/home/dev/f');
    // then
    await expect(reading).rejects.toThrow(new RegExp(`^reading /home/dev/f: x{${String(MAX_ERROR_CHARS)}}$`));
  });

  test('spawnPty opens a remote tty with the env in the command', () => {
    // given
    vi.stubEnv('MAPLE_TAB_ID', undefined);
    vi.stubEnv('CLAUDE_CODE_CHILD_SESSION', '1');
    const { runner, spawnPty, pty } = setup();
    // when
    const result = runner.spawnPty(['tmux', 'new-session'], {
      cwd: '/home/dev/x',
      env: { MAPLE_TAB_ID: 't1' },
      cols: 120,
      rows: 40,
    });
    // then
    expect(result).toBe(pty);
    const [file, args, options] = spawnPty.mock.calls[0];
    expect(file).toBe('ssh');
    expect(args).toEqual([
      ...BASE,
      '-t',
      target,
      '--',
      "cd '/home/dev/x' && exec env 'MAPLE_TAB_ID=t1' 'tmux' 'new-session'",
    ]);
    expect(options).toMatchObject({ name: 'xterm-256color', cols: 120, rows: 40, cwd: homedir() });
    expect(options.env).toMatchObject({ TERM: 'xterm-256color' });
    expect(options.env).not.toHaveProperty('MAPLE_TAB_ID');
    expect(options.env).not.toHaveProperty('CLAUDE_CODE_CHILD_SESSION');
  });

  test('follow tails the VM file from its end', async () => {
    // given
    const { runner, spawn } = setup('one\ntwo\n');
    const lines: string[] = [];
    // when
    stops.push(runner.follow('/home/dev/.xena/hooks.jsonl', (line) => lines.push(line)));
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [
      ...BASE,
      target,
      '--',
      "exec 'tail' '-n' '0' '-F' '--' '/home/dev/.xena/hooks.jsonl'",
    ]);
    await vi.waitFor(() => {
      expect(lines).toEqual(['one', 'two']);
    });
  });

  describe('start', () => {
    const master = [...BASE, '-f', '-N', '-o', 'ExitOnForwardFailure=yes'];

    test.each([
      {
        name: 'with the vault forward',
        vaultSocket: '/state/vault.sock',
        expected: [...master, '-R', '/home/dev/.xena/vault.sock:/state/vault.sock', target],
      },
      { name: 'without a vault socket', vaultSocket: null, expected: [...master, target] },
    ])('starts the master $name', async ({ vaultSocket, expected }) => {
      // given
      const { runner, spawn } = setup('', 0, '', { ...remote, vaultSocket });
      // when
      await runner.start();
      // then
      expect(spawn).toHaveBeenCalledWith('ssh', expected);
    });

    test('rejects with the ssh error', async () => {
      // given
      const { runner } = setup('', 255, 'Host key verification failed.\n');
      // when
      const starting = runner.start();
      // then
      await expect(starting).rejects.toThrow('starting ssh master: Host key verification failed.');
    });

    test('caps ssh error text', async () => {
      // given
      const { runner } = setup('', 255, 'x'.repeat(MAX_ERROR_CHARS + 1));
      // when
      const starting = runner.start();
      // then
      await expect(starting).rejects.toThrow(new RegExp(`^starting ssh master: x{${String(MAX_ERROR_CHARS)}}$`));
    });
  });

  describe('check', () => {
    test.each([
      { code: 0, expected: true },
      { code: 255, expected: false },
    ])('returns $expected for exit code $code', async ({ code, expected }) => {
      // given
      const { runner, spawn } = setup('', code);
      // when
      const running = await runner.check();
      // then
      expect(spawn).toHaveBeenCalledWith('ssh', [...BASE, '-O', 'check', target]);
      expect(running).toBe(expected);
    });
  });

  describe('keepAlive', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function spied(alive: boolean) {
      const { runner } = setup();
      const check = vi.spyOn(runner, 'check').mockResolvedValue(alive);
      const start = vi.spyOn(runner, 'start').mockResolvedValue();
      return { runner, check, start };
    }

    test.each([
      { name: 'restarts and announces after a failed check', alive: false, restarts: 1 },
      { name: 'leaves a running master alone', alive: true, restarts: 0 },
    ])('$name', async ({ alive, restarts }) => {
      // given
      const { runner, check, start } = spied(alive);
      const announce = vi.fn();
      stops.push(runner.keepAlive(vi.fn(), KEEP_ALIVE_MS, announce));
      // when
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
      // then
      expect(check).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(restarts);
      expect(announce).toHaveBeenCalledTimes(restarts);
    });

    test('announces the touch before restarting', async () => {
      // given
      const { runner, start } = spied(false);
      const order: string[] = [];
      start.mockImplementation(() => {
        order.push('start');
        return Promise.resolve();
      });
      stops.push(runner.keepAlive(vi.fn(), KEEP_ALIVE_MS, () => order.push('announce')));
      // when
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
      // then
      expect(order).toEqual(['announce', 'start']);
    });

    test('retries on the next tick after a failure', async () => {
      // given
      const { runner, start } = spied(false);
      start.mockRejectedValue(new Error('starting ssh master: refused'));
      stops.push(runner.keepAlive(vi.fn()));
      // when
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 2);
      // then
      expect(start).toHaveBeenCalledTimes(2);
    });

    test('sends a check failure to onError', async () => {
      // given
      const { runner, check } = spied(true);
      const failure = new Error('running command: output exceeds 4 bytes');
      check.mockRejectedValue(failure);
      const onError = vi.fn();
      stops.push(runner.keepAlive(onError));
      // when
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
      // then
      expect(onError).toHaveBeenCalledWith(failure);
    });

    test('stop during a check prevents the restart', async () => {
      // given
      const { runner, check, start } = spied(false);
      let finish: (alive: boolean) => void = () => undefined;
      check.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      );
      const stop = runner.keepAlive(vi.fn());
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
      // when
      stop();
      finish(false);
      await vi.advanceTimersByTimeAsync(0);
      // then
      expect(start).not.toHaveBeenCalled();
    });

    test('sends a start failure to onError', async () => {
      // given
      const { runner, start } = spied(false);
      const failure = new Error('starting ssh master: refused');
      start.mockRejectedValue(failure);
      const onError = vi.fn();
      stops.push(runner.keepAlive(onError));
      // when
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
      // then
      expect(onError).toHaveBeenCalledWith(failure);
    });

    test('never overlaps ticks', async () => {
      // given
      const { runner, check, start } = spied(false);
      let finish: () => void = () => undefined;
      start.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      stops.push(runner.keepAlive(vi.fn()));
      // when
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 3);
      // then
      expect(check).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      finish();
    });

    test('stop ends the interval', async () => {
      // given
      const { runner, check } = spied(true);
      const stop = runner.keepAlive(vi.fn());
      // when
      stop();
      await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 2);
      // then
      expect(check).not.toHaveBeenCalled();
    });
  });
});
