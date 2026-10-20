import type { IPty, spawn } from 'node-pty';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Terminals } from './terminals';

type FakePty = {
  file: string;
  args: string[];
  options: { cwd?: string; env?: Record<string, string | undefined> };
  written: string[];
  resized: [number, number][];
  killed: boolean;
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
};

function setup() {
  const ptys: FakePty[] = [];
  const spawnFn = vi.fn<typeof spawn>((file, args, options) => {
    let onData: (data: string) => void = () => undefined;
    let onExit: (e: { exitCode: number }) => void = () => undefined;
    const fake: FakePty = {
      file,
      args: typeof args === 'string' ? [args] : args,
      options,
      written: [],
      resized: [],
      killed: false,
      emitData: (data) => {
        onData(data);
      },
      emitExit: (exitCode) => {
        onExit({ exitCode });
      },
    };
    ptys.push(fake);
    const pty = {
      onData: (cb: (data: string) => void) => {
        onData = cb;
        return { dispose: () => undefined };
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        onExit = cb;
        return { dispose: () => undefined };
      },
      write: (data: string) => {
        fake.written.push(data);
      },
      resize: (cols: number, rows: number) => {
        fake.resized.push([cols, rows]);
      },
      kill: () => {
        fake.killed = true;
      },
    };
    return pty as unknown as IPty;
  });
  return { terminals: new Terminals({ spawn: spawnFn }), ptys, spawnFn };
}

describe('Terminals', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'SHELL', shell: '/usr/bin/zsh', want: '/usr/bin/zsh' },
    { name: '/bin/bash when SHELL is unset', shell: undefined, want: '/bin/bash' },
  ])('open spawns $name as a login shell in the cwd', ({ shell, want }) => {
    // given
    vi.stubEnv('SHELL', shell);
    vi.stubEnv('MAPLE_TAB_ID', 'leaked');
    vi.stubEnv('MAPLE_SOCKET', '/tmp/leaked.sock');
    const { terminals, ptys } = setup();
    // when
    terminals.open('t1', '/tmp/wts/card');
    // then
    expect(ptys).toHaveLength(1);
    expect(ptys[0].file).toBe(want);
    expect(ptys[0].args).toEqual(['-l']);
    expect(ptys[0].options.cwd).toBe('/tmp/wts/card');
    expect(ptys[0].options.env?.TERM).toBe('xterm-256color');
    expect(ptys[0].options.env).not.toHaveProperty('MAPLE_TAB_ID');
    expect(ptys[0].options.env).not.toHaveProperty('MAPLE_SOCKET');
  });

  test('a second open does not spawn again', () => {
    // given
    const { terminals, ptys } = setup();
    terminals.open('t1', '/tmp/a');
    // when
    terminals.open('t1', '/tmp/a');
    // then
    expect(ptys).toHaveLength(1);
  });

  test('open after exit spawns again', () => {
    // given
    const { terminals, ptys } = setup();
    const exits: [string, number][] = [];
    terminals.on('exit', (tabId, code) => exits.push([tabId, code]));
    terminals.open('t1', '/tmp/a');
    ptys[0].emitExit(1);
    // when
    terminals.open('t1', '/tmp/a');
    // then
    expect(exits).toEqual([['t1', 1]]);
    expect(ptys).toHaveLength(2);
  });

  test('write and resize reach the pty', () => {
    // given
    const { terminals, ptys } = setup();
    terminals.open('t1', '/tmp/a');
    // when
    terminals.write('t1', 'pwd\r');
    terminals.resize('t1', 100, 30);
    // then
    expect(ptys[0].written).toEqual(['pwd\r']);
    expect(ptys[0].resized).toEqual([[100, 30]]);
  });

  test('close kills the pty', () => {
    // given
    const { terminals, ptys } = setup();
    terminals.open('t1', '/tmp/a');
    // when
    terminals.close('t1');
    // then
    expect(ptys[0].killed).toBe(true);
    expect(terminals.backlog('t1')).toBe('');
  });

  test('closeAll kills every pty', () => {
    // given
    const { terminals, ptys } = setup();
    terminals.open('t1', '/tmp/a');
    terminals.open('t2', '/tmp/b');
    // when
    terminals.closeAll();
    // then
    expect(ptys.map((p) => p.killed)).toEqual([true, true]);
  });

  test('data is emitted and the backlog keeps only the last 200,000 characters', () => {
    // given
    const { terminals, ptys } = setup();
    const data: [string, string][] = [];
    terminals.on('data', (tabId, chunk) => data.push([tabId, chunk.slice(0, 1)]));
    terminals.open('t1', '/tmp/a');
    // when
    ptys[0].emitData('a'.repeat(150_000));
    ptys[0].emitData('b'.repeat(100_000));
    // then
    expect(data).toEqual([
      ['t1', 'a'],
      ['t1', 'b'],
    ]);
    expect(terminals.backlog('t1')).toBe('a'.repeat(100_000) + 'b'.repeat(100_000));
  });
});
