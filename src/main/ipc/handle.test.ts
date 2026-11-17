import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import { errorText } from '@shared/errors/errorText';
import { tabIdArg } from './args';
import { handle, type Handler } from './handle';
import { recordActions, type ActionRecorder } from './recordActions';

type Listener = (event: unknown, ...args: unknown[]) => unknown;

const ipc = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, listener: Listener) => void>(),
}));

vi.mock('electron', () => ({ ipcMain: ipc }));

const none: Fetched<PrInfo> = { data: null, error: null, fetchedAt: null };

function setup(args: z.ZodType<[string]>, run: Handler<'pr', 'get'>) {
  const record = vi.fn<ActionRecorder>();
  recordActions(record);
  handle('pr', 'get', args, run);
  const listener = ipc.handle.mock.lastCall?.[1];
  if (!listener) {
    throw new Error('registering pr:get: no listener was registered');
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

describe('handle', () => {
  test('registers the area:method channel', () => {
    // given
    const run = vi.fn(() => none);

    // when
    setup(z.tuple([tabIdArg]), run);

    // then
    expect(ipc.handle.mock.lastCall?.[0]).toBe('pr:get');
  });

  test('records the channel and parsed arguments before running', () => {
    // given
    const calledFirst: boolean[] = [];
    const run = vi.fn(() => {
      calledFirst.push(record.mock.calls.length === 1);
      return none;
    });
    const { record, listener } = setup(z.tuple([tabIdArg]), run);

    // when
    listener({}, 'a');

    // then
    expect(record.mock.calls).toEqual([['pr:get', ['a']]]);
    expect(run.mock.calls).toEqual([['a']]);
    expect(calledFirst).toEqual([true]);
  });

  test('records the parsed arguments, not the raw ones', () => {
    // given
    const { record, listener } = setup(
      z.tuple([z.string().trim()]),
      vi.fn(() => none),
    );

    // when
    listener({}, '  a  ');

    // then
    expect(record.mock.calls).toEqual([['pr:get', ['a']]]);
  });

  test('records nothing when the arguments are invalid', () => {
    // given
    const run = vi.fn(() => none);
    const { record, listener } = setup(z.tuple([tabIdArg]), run);

    // when
    const thrown = errorFrom(() => listener({}, 42));

    // then
    expect(thrown).toBe('handling pr:get: arguments are invalid');
    expect(record).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  test('types the run function from the API method', () => {
    // given
    type Run = Handler<'pr', 'get'>;

    // when
    const parameters = expectTypeOf<Run>().parameters;

    // then
    parameters.toEqualTypeOf<[string]>();
    expectTypeOf<Run>().returns.toEqualTypeOf<Promise<Fetched<PrInfo>> | Fetched<PrInfo>>();
  });
});
