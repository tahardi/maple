import { act, renderHook, waitFor } from '@testing-library/react';
import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { finding, findingsFile } from '@renderer/testing/findingsFixture';
import { useFindings } from './useFindings';

function setup(results: Fetched<FindingsFile>[]) {
  const changed: { value: () => void } = { value: () => undefined };
  const stop = vi.fn();
  const get = vi.fn<(tabId: string) => Promise<Fetched<FindingsFile>>>();
  for (const result of results) {
    get.mockResolvedValueOnce(result);
  }
  const onChanged = vi.fn((cb: () => void) => {
    changed.value = cb;
    return stop;
  });
  fakeMaple({ findings: { get, onChanged } });
  return { changed, stop, get };
}

const first = { data: findingsFile([finding()]), error: null, fetchedAt: '2026-11-12T12:00:00.000Z' };
const second = {
  data: findingsFile([finding(), finding({ id: 'F2' })]),
  error: null,
  fetchedAt: '2026-11-12T12:01:00.000Z',
};

describe('useFindings', () => {
  test('reads the findings for the tab', async () => {
    // given
    const { get } = setup([first]);
    // when
    const { result } = renderHook(() => useFindings('t1'));
    // then
    await waitFor(() => {
      expect(result.current).toEqual(first);
    });
    expect(get).toHaveBeenCalledWith('t1');
  });

  test('reloads when the findings change', async () => {
    // given
    const { changed } = setup([first, second]);
    const { result } = renderHook(() => useFindings('t1'));
    await waitFor(() => {
      expect(result.current).toEqual(first);
    });
    // when
    act(() => {
      changed.value();
    });
    // then
    await waitFor(() => {
      expect(result.current).toEqual(second);
    });
  });

  test('shows a failed read as its error', async () => {
    // given
    const { get } = setup([]);
    get.mockRejectedValue(new Error("Error invoking remote method 'findings:get': Error: reading findings: boom"));
    // when
    const { result } = renderHook(() => useFindings('t1'));
    // then
    await waitFor(() => {
      expect(result.current).toEqual({ data: null, error: 'reading findings: boom', fetchedAt: null });
    });
  });

  test('stops listening on unmount', () => {
    // given
    const { stop } = setup([first]);
    const { unmount } = renderHook(() => useFindings('t1'));
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalled();
  });
});
