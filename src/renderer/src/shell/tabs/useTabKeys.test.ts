import type { MapleApi } from '@shared/api/mapleApi';
import type { TabState } from '@shared/types/tabs/tabState';
import { fireEvent, renderHook } from '@testing-library/react';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { useTabKeys } from './useTabKeys';

const tab = (id: string, kind: TabState['kind'] = 'card'): TabState => ({
  id,
  projectKey: 'BEAR',
  kind,
  cardKey: null,
  sessionId: `s-${id}`,
  worktreePath: null,
  worktreePaths: [],
});

const close = vi.fn<MapleApi['tabs']['close']>(() => Promise.resolve({ closed: true, needsConfirm: false }));

describe('useTabKeys', () => {
  beforeEach(() => {
    close.mockClear();
    fakeMaple({ tabs: { close } });
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ projectKey: 'BEAR', tabs: [tab('t1'), tab('t2')], activeTabId: 't1' });
  });

  test.each([
    { keys: 'Ctrl+Tab', shiftKey: false, to: 't2' },
    { keys: 'Ctrl+Shift+Tab', shiftKey: true, to: null },
  ])('$keys activates $to', ({ shiftKey, to }) => {
    // given
    renderHook(() => {
      useTabKeys();
    });
    // when
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey });
    // then
    expect(useMaple.getState().activeTabId).toBe(to);
  });

  test('Ctrl+Shift+W closes the active card tab', () => {
    // given
    renderHook(() => {
      useTabKeys();
    });
    // when
    fireEvent.keyDown(window, { key: 'W', ctrlKey: true, shiftKey: true });
    // then
    expect(close).toHaveBeenCalledWith('t1', false);
  });

  test('Ctrl+Shift+W does nothing on Home', () => {
    // given
    useMaple.setState({ activeTabId: null });
    renderHook(() => {
      useTabKeys();
    });
    // when
    fireEvent.keyDown(window, { key: 'W', ctrlKey: true, shiftKey: true });
    // then
    expect(close).not.toHaveBeenCalled();
  });

  test('Ctrl+W is left alone', () => {
    // given
    renderHook(() => {
      useTabKeys();
    });
    // when
    const notCanceled = fireEvent.keyDown(window, { key: 'w', ctrlKey: true });
    // then
    expect(close).not.toHaveBeenCalled();
    expect(notCanceled).toBe(true);
  });

  test('the key never reaches a focused terminal or editor', () => {
    // given
    renderHook(() => {
      useTabKeys();
    });
    const textarea = document.createElement('textarea');
    const spy = vi.fn();
    textarea.addEventListener('keydown', spy);
    document.body.append(textarea);
    // when
    fireEvent.keyDown(textarea, { key: 'Tab', ctrlKey: true });
    // then
    expect(spy).not.toHaveBeenCalled();
    textarea.remove();
  });

  test('Ctrl+Shift+W does nothing on the vault tab', () => {
    // given
    useMaple.setState({ tabs: [tab('t1'), tab('v1', 'vault')], activeTabId: 'v1' });
    renderHook(() => {
      useTabKeys();
    });
    // when
    fireEvent.keyDown(window, { key: 'W', ctrlKey: true, shiftKey: true });
    // then
    expect(close).not.toHaveBeenCalled();
  });

  test.each([{ modifier: 'altKey' }, { modifier: 'metaKey' }])('Ctrl+Tab with $modifier is ignored', ({ modifier }) => {
    // given
    renderHook(() => {
      useTabKeys();
    });
    // when
    const notCanceled = fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, [modifier]: true });
    // then
    expect(useMaple.getState().activeTabId).toBe('t1');
    expect(notCanceled).toBe(true);
  });

  test('Ctrl+Shift+W never reaches a focused terminal or editor', () => {
    // given
    renderHook(() => {
      useTabKeys();
    });
    const textarea = document.createElement('textarea');
    const spy = vi.fn();
    textarea.addEventListener('keydown', spy);
    document.body.append(textarea);
    // when
    fireEvent.keyDown(textarea, { key: 'W', ctrlKey: true, shiftKey: true });
    // then
    expect(spy).not.toHaveBeenCalled();
    textarea.remove();
  });

  test('unmounting stops listening for keys', () => {
    // given
    const { unmount } = renderHook(() => {
      useTabKeys();
    });
    unmount();
    // when
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    // then
    expect(useMaple.getState().activeTabId).toBe('t1');
  });
});
