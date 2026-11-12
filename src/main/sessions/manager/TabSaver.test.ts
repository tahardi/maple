import { describe, expect, test, vi } from 'vitest';
import type { TabState } from '@shared/types/tabs/tabState';
import { TabSaver } from './TabSaver';

function setup(save: () => Promise<void> = () => Promise.resolve()) {
  let state: { tabs: TabState[]; closedSessions: Record<string, string> } = { tabs: [], closedSessions: {} };
  const saveFn = vi.fn<(tabs: TabState[], closed: Record<string, string>) => Promise<void>>(save);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const saver = new TabSaver({ save: saveFn, snapshot: () => state, logger });
  const set = (closedSessions: Record<string, string>) => {
    state = { tabs: [], closedSessions };
  };
  return { saver, save: saveFn, logger, set };
}

describe('TabSaver', () => {
  test('changed saves the snapshot right away', () => {
    // given
    const { saver, save, set } = setup();
    set({ 'DIG-1': 'a' });
    // when
    saver.changed();
    // then
    expect(save.mock.calls).toEqual([[[], { 'DIG-1': 'a' }]]);
  });

  test('hold saves nothing until released, then saves once', () => {
    // given
    const { saver, save } = setup();
    const release = saver.hold();
    // when
    saver.changed();
    saver.changed();
    // then
    expect(save).not.toHaveBeenCalled();
    // when
    release();
    // then
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('release saves the snapshot as it is at release', () => {
    // given
    const { saver, save, set } = setup();
    const release = saver.hold();
    set({ 'DIG-1': 'a' });
    saver.changed();
    set({ 'DIG-1': 'b' });
    // when
    release();
    // then
    expect(save.mock.calls).toEqual([[[], { 'DIG-1': 'b' }]]);
  });

  test('release without a change saves nothing', () => {
    // given
    const { saver, save } = setup();
    const release = saver.hold();
    // when
    release();
    // then
    expect(save).not.toHaveBeenCalled();
  });

  test('a new hold forgets changes from an earlier hold', () => {
    // given
    const { saver, save } = setup();
    const first = saver.hold();
    saver.changed();
    first();
    save.mockClear();
    const second = saver.hold();
    // when
    second();
    // then
    expect(save).not.toHaveBeenCalled();
  });

  test('a failed save logs at error', async () => {
    // given
    const { saver, logger } = setup(() => Promise.reject(new Error('disk full')));
    // when
    saver.changed();
    // then
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith('session', 'failed', { operation: 'saveState', error: 'disk full' });
    });
  });
});
