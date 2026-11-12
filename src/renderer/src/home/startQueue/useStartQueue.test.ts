import type { QueueState } from '@shared/types/queue/queueState';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { useStartQueue } from './useStartQueue';

const loaded: QueueState = {
  cards: [{ projectKey: 'DIG', cardKey: 'DIG-45' }],
  working: 4,
  limit: 4,
  waitingFor: 'room',
  failure: null,
};

function setup() {
  const queued: { value: (state: QueueState) => void } = { value: () => undefined };
  const stop = vi.fn();
  const onQueue = vi.fn((cb: (state: QueueState) => void) => {
    queued.value = cb;
    return stop;
  });
  fakeMaple({ tabs: { startQueue: vi.fn(() => Promise.resolve(loaded)), onQueue } });
  return { queued, stop };
}

describe('useStartQueue', () => {
  test('loads the queue and follows queue events', async () => {
    // given
    const { queued } = setup();
    const { result } = renderHook(() => useStartQueue());
    await waitFor(() => {
      expect(result.current).toEqual(loaded);
    });
    const next: QueueState = { ...loaded, cards: [], waitingFor: null };
    // when
    act(() => {
      queued.value(next);
    });
    // then
    expect(result.current).toEqual(next);
  });

  test('a first load that arrives after a queue event is ignored', async () => {
    // given
    let resolveLoad: (state: QueueState) => void = () => undefined;
    let emit: (state: QueueState) => void = () => undefined;
    fakeMaple({
      tabs: {
        startQueue: vi.fn(
          () =>
            new Promise<QueueState>((resolve) => {
              resolveLoad = resolve;
            }),
        ),
        onQueue: vi.fn((cb: (state: QueueState) => void) => {
          emit = cb;
          return vi.fn();
        }),
      },
    });
    const { result } = renderHook(() => useStartQueue());
    const next: QueueState = { ...loaded, cards: [], waitingFor: null };
    act(() => {
      emit(next);
    });
    // when
    await act(async () => {
      resolveLoad(loaded);
      await Promise.resolve();
    });
    // then
    expect(result.current).toEqual(next);
  });

  test('unmounting stops listening for queue events', () => {
    // given
    const { stop } = setup();
    const { unmount } = renderHook(() => useStartQueue());
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalled();
  });
});
