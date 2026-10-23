import type { VaultNote } from '@shared/types/files';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { useVault } from './useVault';

const note = (path: string): VaultNote => ({ path, modifiedAt: '2026-10-22T12:00:00.000Z' });

function setup(notes: VaultNote[]) {
  const changed: { value: () => void } = { value: () => undefined };
  const stop = vi.fn();
  const list = vi.fn(() => Promise.resolve(notes));
  const written = vi.fn(() => Promise.resolve(['Inbox.md']));
  const onChanged = vi.fn((cb: () => void) => {
    changed.value = cb;
    return stop;
  });
  fakeMaple({ vault: { list, written, onChanged } });
  return { changed, stop, list, written, onChanged };
}

describe('useVault', () => {
  test('lists the notes and the notes the tab wrote', async () => {
    // given
    const { written } = setup([note('Inbox.md')]);
    // when
    const { result } = renderHook(() => useVault('t1', true));
    // then
    await waitFor(() => {
      expect(result.current.notes).toEqual([note('Inbox.md')]);
    });
    expect(result.current.written).toEqual(['Inbox.md']);
    expect(written).toHaveBeenCalledWith('t1');
  });

  test('re-lists when the vault changes', async () => {
    // given
    const { changed, list, written } = setup([note('Inbox.md')]);
    const { result } = renderHook(() => useVault('t1', true));
    await waitFor(() => {
      expect(result.current.notes).toHaveLength(1);
    });
    list.mockResolvedValue([note('Inbox.md'), note('New.md')]);
    // when
    act(() => {
      changed.value();
    });
    // then
    await waitFor(() => {
      expect(result.current.notes).toEqual([note('Inbox.md'), note('New.md')]);
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(written).toHaveBeenCalledTimes(2);
  });

  test('swaps its listener on each re-list', async () => {
    // given
    const { changed, list, stop, onChanged } = setup([]);
    renderHook(() => useVault('t1', true));
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      changed.value();
    });
    // then
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  test('stops listening when disabled', () => {
    // given
    const { stop } = setup([]);
    const { rerender } = renderHook(({ enabled }) => useVault('t1', enabled), { initialProps: { enabled: true } });
    // when
    rerender({ enabled: false });
    // then
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('stops listening on unmount', () => {
    // given
    const { stop } = setup([]);
    const { unmount } = renderHook(() => useVault('t1', true));
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalled();
  });

  test('neither lists nor listens when disabled', () => {
    // given
    const { list, onChanged } = setup([]);
    // when
    renderHook(() => useVault('t1', false));
    // then
    expect(list).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
