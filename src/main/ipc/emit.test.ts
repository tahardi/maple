import type { BrowserWindow } from 'electron';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { emit, type EmitArgs } from './emit';

const status: TabStatus = {
  tabId: 't1',
  dot: 'working',
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
  sync: null,
};

function fakeWindow(destroyed: boolean) {
  const send = vi.fn();
  const win = { isDestroyed: () => destroyed, webContents: { send } } as unknown as BrowserWindow;
  return { win, send };
}

describe('emit', () => {
  test.each([
    {
      area: 'tabs',
      method: 'onStatus',
      channel: 'tabs:status',
      fire: (win: BrowserWindow) => {
        emit(win, 'tabs', 'onStatus', status);
      },
      want: ['tabs:status', status],
    },
    {
      area: 'tabs',
      method: 'onActivate',
      channel: 'tabs:activate',
      fire: (win: BrowserWindow) => {
        emit(win, 'tabs', 'onActivate', 't1');
      },
      want: ['tabs:activate', 't1'],
    },
    {
      area: 'repo',
      method: 'onChanged',
      channel: 'repo:changed:t1',
      fire: (win: BrowserWindow) => {
        emit(win, 'repo', 'onChanged', 't1');
      },
      want: ['repo:changed:t1'],
    },
    {
      area: 'terminal',
      method: 'onExit',
      channel: 'terminal:exit:t1:2',
      fire: (win: BrowserWindow) => {
        emit(win, 'terminal', 'onExit', 't1:2', 0);
      },
      want: ['terminal:exit:t1:2', 0],
    },
  ])('$area $method sends $channel', ({ fire, want }) => {
    // given
    const { win, send } = fakeWindow(false);

    // when
    fire(win);

    // then
    expect(send.mock.calls).toEqual([want]);
  });

  test('sends nothing to a destroyed window', () => {
    // given
    const { win, send } = fakeWindow(true);

    // when
    emit(win, 'tabs', 'onActivate', 't1');

    // then
    expect(send).not.toHaveBeenCalled();
  });

  test('sends nothing without a window', () => {
    // given
    const win = null;

    // when
    const call = () => {
      emit(win, 'tabs', 'onActivate', 't1');
    };

    // then
    expect(call).not.toThrow();
  });

  test('types the arguments from the API event', () => {
    // given
    type Exit = EmitArgs<'terminal', 'onExit'>;

    // when
    const exit = expectTypeOf<Exit>();

    // then
    exit.toEqualTypeOf<[string, number]>();
    expectTypeOf<EmitArgs<'tabs', 'onStatus'>>().toEqualTypeOf<[TabStatus]>();
    expectTypeOf<EmitArgs<'vault', 'onChanged'>>().toEqualTypeOf<[]>();
  });
});
