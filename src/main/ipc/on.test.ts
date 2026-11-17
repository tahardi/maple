import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { tabIdArg } from './args';
import { on } from './on';
import { recordActions, type ActionRecorder } from './recordActions';

type Listener = (event: unknown, ...args: unknown[]) => unknown;

const ipc = vi.hoisted(() => ({
  on: vi.fn<(channel: string, listener: Listener) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: ipc }));

function setup(args: z.ZodType<[string, string]>, run: (tabId: string, data: string) => void) {
  const record = vi.fn<ActionRecorder>();
  recordActions(record);
  on('session', 'write', args, run);
  const listener = ipc.on.mock.lastCall?.[1];
  if (!listener) {
    throw new Error('registering session:write: no listener was registered');
  }
  return { record, listener };
}

describe('on', () => {
  test('registers the area:method channel', () => {
    // given
    const run = vi.fn();

    // when
    setup(z.tuple([tabIdArg, z.string()]), run);

    // then
    expect(ipc.on.mock.lastCall?.[0]).toBe('session:write');
  });

  test('records the channel and parsed arguments before running', () => {
    // given
    const calledFirst: boolean[] = [];
    const run = vi.fn(() => {
      calledFirst.push(record.mock.calls.length === 1);
    });
    const { record, listener } = setup(z.tuple([tabIdArg, z.string()]), run);

    // when
    listener({}, 't1', 'a');

    // then
    expect(record.mock.calls).toEqual([['session:write', ['t1', 'a']]]);
    expect(run.mock.calls).toEqual([['t1', 'a']]);
    expect(calledFirst).toEqual([true]);
  });

  test('records the parsed arguments, not the raw ones', () => {
    // given
    const { record, listener } = setup(z.tuple([tabIdArg, z.string().trim()]), vi.fn());

    // when
    listener({}, 't1', '  a  ');

    // then
    expect(record.mock.calls).toEqual([['session:write', ['t1', 'a']]]);
  });

  test('records nothing when the arguments are invalid', () => {
    // given
    const run = vi.fn();
    const { record, listener } = setup(z.tuple([tabIdArg, z.string()]), run);

    // when
    const returned = listener({}, 't1', 42);

    // then
    expect(returned).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
