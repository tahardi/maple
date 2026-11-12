import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { handle, on, recordActions, type ActionRecorder } from './validated';
import { errorText } from '@shared/errors/errorText';

type Listener = (event: unknown, ...args: unknown[]) => unknown;

const ipc = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, listener: Listener) => void>(),
  on: vi.fn<(channel: string, listener: Listener) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: ipc }));

const register = { handle, on };

function setup(name: 'handle' | 'on', run: (text: string) => void) {
  const record = vi.fn<ActionRecorder>();
  recordActions(record);
  register[name]('x:y', z.tuple([z.string()]), run);
  const listener = ipc[name].mock.lastCall?.[1];
  if (!listener) {
    throw new Error('registering x:y: no listener was registered');
  }
  return { record, listener };
}

function errorFrom(call: () => unknown): string | null {
  try {
    call();
    return null;
  } catch (err) {
    return errorText(err);
  }
}

describe('validated', () => {
  test.each([{ name: 'handle' as const }, { name: 'on' as const }])(
    '$name records the channel and parsed arguments before running',
    ({ name }) => {
      // given
      const calledFirst: boolean[] = [];
      const run = vi.fn(() => {
        calledFirst.push(record.mock.calls.length === 1);
      });
      const { record, listener } = setup(name, run);

      // when
      listener({}, 'a');

      // then
      expect(record.mock.calls).toEqual([['x:y', ['a']]]);
      expect(run.mock.calls).toEqual([['a']]);
      expect(calledFirst).toEqual([true]);
    },
  );

  test.each([{ name: 'handle' as const }, { name: 'on' as const }])(
    '$name records the parsed arguments, not the raw ones',
    ({ name }) => {
      // given
      const record = vi.fn<ActionRecorder>();
      recordActions(record);
      register[name]('x:z', z.tuple([z.string().trim()]), vi.fn());
      const listener = ipc[name].mock.lastCall?.[1];

      // when
      listener?.({}, '  a  ');

      // then
      expect(record.mock.calls).toEqual([['x:z', ['a']]]);
    },
  );

  test.each([
    { name: 'handle' as const, error: 'handling x:y: arguments are invalid' },
    { name: 'on' as const, error: null },
  ])('$name records nothing when the arguments are invalid', ({ name, error }) => {
    // given
    const run = vi.fn();
    const { record, listener } = setup(name, run);

    // when
    const thrown = errorFrom(() => listener({}, 42));

    // then
    expect(thrown).toBe(error);
    expect(record).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
