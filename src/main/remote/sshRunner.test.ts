import type { ChildProcessWithoutNullStreams, spawn as childSpawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { PassThrough } from 'node:stream';
import type { IPty, spawn as ptySpawn } from 'node-pty';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RemoteConfig } from '@shared/types/config/remoteConfig';
import { remoteCommand, shellQuote, SshRunner } from './sshRunner';

type FakeChild = EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => void };

const remote: RemoteConfig = {
  host: '192.168.150.10',
  user: 'dev',
  keyPath: '/k/id',
  knownHostsPath: '/k/known_hosts',
  vaultSocket: '/state/vault.sock',
};

const configDir = '/cfg';

const TARGET = 'dev@192.168.150.10';

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

function fakeSpawn(...children: FakeChild[]): typeof childSpawn {
  const spawn = vi.fn<() => ChildProcessWithoutNullStreams>();
  for (const child of children) {
    spawn.mockReturnValueOnce(child as unknown as ChildProcessWithoutNullStreams);
  }
  return spawn as unknown as typeof childSpawn;
}

function runner(spawn: typeof childSpawn, config: RemoteConfig = remote): SshRunner {
  const spawnPty = vi.fn<typeof ptySpawn>();
  return new SshRunner(config, configDir, { spawn, spawnPty });
}

describe('shellQuote', () => {
  test.each([
    { arg: 'abc', want: "'abc'" },
    { arg: "it's", want: "'it'\\''s'" },
    { arg: '', want: "''" },
  ])('quotes $arg', ({ arg, want }) => {
    // given
    const input = arg;
    // when
    const quoted = shellQuote(input);
    // then
    expect(quoted).toBe(want);
  });

  test('survives sh -c as one word', () => {
    // given
    const s = "a b; rm -rf ~ $(x) 'q'";
    // when
    const out = execFileSync('sh', ['-c', `printf %s ${shellQuote(s)}`]).toString('utf8');
    // then
    expect(out).toBe(s);
  });
});

describe('remoteCommand', () => {
  test.each([
    { name: 'plain', cwd: undefined, env: undefined, want: "exec 'git' 'status'" },
    { name: 'cwd', cwd: '/home/dev/x', env: undefined, want: "cd '/home/dev/x' && exec 'git' 'status'" },
    {
      name: 'cwd and env',
      cwd: '/home/dev/x',
      env: { MAPLE_TAB_ID: 't1' },
      want: "cd '/home/dev/x' && exec env 'MAPLE_TAB_ID=t1' 'git' 'status'",
    },
  ])('builds the $name form', ({ cwd, env, want }) => {
    // given
    const cmd = ['git', 'status'];
    // when
    const text = remoteCommand(cmd, cwd, env);
    // then
    expect(text).toBe(want);
  });
});

describe('SshRunner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('exec runs the quoted command over the master connection', async () => {
    // given
    const spawn = fakeSpawn(fakeChild('clean', 0, 'note'));
    // when
    const result = await runner(spawn).exec(['git', 'status'], { cwd: '/home/dev/x' });
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [...BASE, TARGET, '--', "cd '/home/dev/x' && exec 'git' 'status'"]);
    expect(result).toEqual({ stdout: 'clean', stderr: 'note', code: 0 });
  });

  test('exec pipes input to the remote command', async () => {
    // given
    const child = fakeChild('', 0);
    const chunks: Buffer[] = [];
    child.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    const spawn = fakeSpawn(child);
    // when
    await runner(spawn).exec(['cat'], { input: 'x' });
    // then
    expect(Buffer.concat(chunks).toString('utf8')).toBe('x');
    expect(child.stdin.writableEnded).toBe(true);
  });

  test('exec stops the remote command at its timeout', async () => {
    // given
    vi.useFakeTimers();
    const child = openChild();
    // when
    const result = runner(fakeSpawn(child)).exec(['git', 'fetch'], { timeout: 50 });
    const checked = expect(result).rejects.toThrow('running command: timing out after 50ms');
    await vi.advanceTimersByTimeAsync(50);
    // then
    await checked;
    expect(child.kill).toHaveBeenCalled();
  });

  test('exec passes ssh failures through as code 255', async () => {
    // given
    const spawn = fakeSpawn(fakeChild('', 255, 'Connection refused'));
    // when
    const result = await runner(spawn).exec(['git', 'status']);
    // then
    expect(result).toEqual({ stdout: '', stderr: 'Connection refused', code: 255 });
  });

  test('readFile returns raw bytes', async () => {
    // given
    const spawn = fakeSpawn(fakeChild(Buffer.from([0, 1, 2]), 0));
    // when
    const bytes = await runner(spawn).readFile('/home/dev/f');
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [...BASE, TARGET, '--', "exec 'cat' '--' '/home/dev/f'"]);
    expect(bytes).toEqual(Buffer.from([0, 1, 2]));
  });

  test('readFile throws ENOENT when the file is missing', async () => {
    // given
    const spawn = fakeSpawn(fakeChild('', 1, 'cat: /home/dev/f: No such file or directory\n'));
    // when
    const result = runner(spawn).readFile('/home/dev/f');
    // then
    await expect(result).rejects.toMatchObject({
      code: 'ENOENT',
      message: 'reading /home/dev/f: cat: /home/dev/f: No such file or directory',
    });
  });

  test('readFile throws the stderr for any other failure', async () => {
    // given
    const spawn = fakeSpawn(fakeChild('', 1, 'cat: /home/dev/f: Permission denied\n'));
    // when
    const result = runner(spawn).readFile('/home/dev/f');
    // then
    await expect(result).rejects.toThrow('reading /home/dev/f: cat: /home/dev/f: Permission denied');
  });

  test('spawnPty opens a remote tty with the env in the command', () => {
    // given
    const spawnPty = vi.fn<typeof ptySpawn>(() => ({}) as IPty);
    const ssh = new SshRunner(remote, configDir, { spawn: fakeSpawn(), spawnPty });
    // when
    ssh.spawnPty(['tmux', 'new-session'], { cwd: '/home/dev/x', env: { MAPLE_TAB_ID: 't1' }, cols: 120, rows: 40 });
    // then
    expect(spawnPty).toHaveBeenCalledWith(
      'ssh',
      [...BASE, '-t', TARGET, '--', "cd '/home/dev/x' && exec env 'MAPLE_TAB_ID=t1' 'tmux' 'new-session'"],
      {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: homedir(),
        env: expect.objectContaining({ TERM: 'xterm-256color' }) as unknown,
      },
    );
  });

  test('follow tails the VM file from its end', async () => {
    // given
    const spawn = fakeSpawn(fakeChild('one\ntwo\n', 0));
    const lines: string[] = [];
    // when
    const stop = runner(spawn).follow('/home/dev/.xena/hooks.jsonl', (line) => {
      lines.push(line);
    });
    // then
    try {
      expect(spawn).toHaveBeenCalledWith('ssh', [
        ...BASE,
        TARGET,
        '--',
        "exec 'tail' '-n' '0' '-F' '--' '/home/dev/.xena/hooks.jsonl'",
      ]);
      await vi.waitFor(() => {
        expect(lines).toEqual(['one', 'two']);
      });
    } finally {
      stop();
    }
  });
});

describe('SshRunner.start', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    {
      name: 'with a vault socket',
      vaultSocket: '/state/vault.sock',
      forward: ['-R', '/home/dev/.xena/vault.sock:/state/vault.sock'],
    },
    { name: 'without a vault socket', vaultSocket: null, forward: [] },
  ])('starts the master $name', async ({ vaultSocket, forward }) => {
    // given
    const spawn = fakeSpawn(fakeChild('', 0));
    // when
    await runner(spawn, { ...remote, vaultSocket }).start();
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [
      ...BASE,
      '-f',
      '-N',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ConnectTimeout=10',
      ...forward,
      TARGET,
    ]);
  });

  test('rejects with the ssh error when the master fails', async () => {
    // given
    const spawn = fakeSpawn(fakeChild('', 255, 'Host key verification failed.\n'));
    // when
    const result = runner(spawn).start();
    // then
    await expect(result).rejects.toThrow('starting ssh master: Host key verification failed.');
  });

  test('gives up after 60 seconds without a touch', async () => {
    // given
    vi.useFakeTimers();
    const child = openChild();
    const ssh = runner(fakeSpawn(child));
    let settled = false;
    // when
    const result = ssh.start().finally(() => {
      settled = true;
    });
    const checked = expect(result).rejects.toThrow(
      'starting ssh master: timing out after 60s waiting for the VM or a YubiKey touch',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const settledAt30 = settled;
    await vi.advanceTimersByTimeAsync(30_000);
    // then
    await checked;
    expect(settledAt30).toBe(false);
    expect(child.kill).toHaveBeenCalled();
  });
});

describe('SshRunner.check', () => {
  test.each([
    { code: 0, want: true },
    { code: 255, want: false },
  ])('is $want when ssh exits $code', async ({ code, want }) => {
    // given
    const spawn = fakeSpawn(fakeChild('', code));
    // when
    const alive = await runner(spawn).check();
    // then
    expect(spawn).toHaveBeenCalledWith('ssh', [...BASE, '-O', 'check', TARGET]);
    expect(alive).toBe(want);
  });
});

function openChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
}

function stubbed(check: () => Promise<boolean>, start: () => Promise<void>) {
  const ssh = runner(fakeSpawn());
  return {
    ssh,
    check: vi.spyOn(ssh, 'check').mockImplementation(check),
    start: vi.spyOn(ssh, 'start').mockImplementation(start),
  };
}

function hooks() {
  const calls: string[] = [];
  return {
    calls,
    touch: vi.fn(() => calls.push('touch')),
    restarted: vi.fn(() => calls.push('restarted')),
    failed: vi.fn<(err: unknown) => void>(),
  };
}

describe('SshRunner.connect', () => {
  test('reuses a live master without a touch', async () => {
    // given
    const { ssh, start } = stubbed(
      () => Promise.resolve(true),
      () => Promise.resolve(),
    );
    const touch = vi.fn();
    // when
    const started = await ssh.connect(touch);
    // then
    expect(started).toBe(false);
    expect(touch).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  test('asks for a touch before starting a new master', async () => {
    // given
    const order: string[] = [];
    const { ssh } = stubbed(
      () => Promise.resolve(false),
      () => {
        order.push('start');
        return Promise.resolve();
      },
    );
    // when
    const started = await ssh.connect(() => order.push('touch'));
    // then
    expect(started).toBe(true);
    expect(order).toEqual(['touch', 'start']);
  });

  test('passes a start failure back after the touch', async () => {
    // given
    const err = new Error('starting ssh master: Host key verification failed.');
    const { ssh } = stubbed(
      () => Promise.resolve(false),
      () => Promise.reject(err),
    );
    const touch = vi.fn();
    // when
    const result = ssh.connect(touch);
    // then
    await expect(result).rejects.toBe(err);
    expect(touch).toHaveBeenCalledTimes(1);
  });
});

describe('SshRunner.keepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('asks for a touch and restarts the master after a failed check', async () => {
    // given
    const { ssh, check, start } = stubbed(
      () => Promise.resolve(false),
      () => Promise.resolve(),
    );
    const h = hooks();
    // when
    const stop = ssh.keepAlive(h);
    await vi.advanceTimersByTimeAsync(30_000);
    stop();
    // then
    expect(check).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['touch', 'restarted']);
  });

  test('leaves a live master alone', async () => {
    // given
    const { ssh, check, start } = stubbed(
      () => Promise.resolve(true),
      () => Promise.resolve(),
    );
    const h = hooks();
    // when
    const stop = ssh.keepAlive(h);
    await vi.advanceTimersByTimeAsync(30_000);
    stop();
    // then
    expect(check).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  test('sends a start failure to failed', async () => {
    // given
    const err = new Error('starting ssh master: boom');
    const { ssh } = stubbed(
      () => Promise.resolve(false),
      () => Promise.reject(err),
    );
    const h = hooks();
    // when
    const stop = ssh.keepAlive(h);
    await vi.advanceTimersByTimeAsync(30_000);
    stop();
    // then
    expect(h.failed).toHaveBeenCalledWith(err);
    expect(h.restarted).not.toHaveBeenCalled();
  });

  test('a hung check times out and reaches failed', async () => {
    // given
    const child = openChild();
    const ssh = runner(fakeSpawn(child));
    const h = hooks();
    // when
    const stop = ssh.keepAlive(h);
    await vi.advanceTimersByTimeAsync(60_000);
    stop();
    // then
    expect(child.kill).toHaveBeenCalled();
    expect(h.failed).toHaveBeenCalledWith(new Error('running command: timing out after 30000ms'));
  });

  test('stop ends the interval', async () => {
    // given
    const { ssh, check } = stubbed(
      () => Promise.resolve(true),
      () => Promise.resolve(),
    );
    const stop = ssh.keepAlive(hooks());
    // when
    stop();
    await vi.advanceTimersByTimeAsync(90_000);
    // then
    expect(check).not.toHaveBeenCalled();
  });

  test('ticks never overlap', async () => {
    // given
    const { ssh, check } = stubbed(
      () => new Promise<boolean>(() => undefined),
      () => Promise.resolve(),
    );
    // when
    const stop = ssh.keepAlive(hooks());
    await vi.advanceTimersByTimeAsync(90_000);
    stop();
    // then
    expect(check).toHaveBeenCalledTimes(1);
  });
});
