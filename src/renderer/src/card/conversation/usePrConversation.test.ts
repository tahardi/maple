import type { PrComment } from '@shared/types/github/prComment';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { usePrConversation } from './usePrConversation';

const comment: PrComment = {
  url: 'https://github.com/tahardi/maple/pull/33#issuecomment-2001',
  author: 'tahardi',
  at: '2026-10-25T10:00:00Z',
  body: 'Looks close.',
};

type Props = { tabId: string; enabled: boolean; prFetchedAt: string | null };

const props: Props = { tabId: 't1', enabled: true, prFetchedAt: null };

const render = (initialProps: Props = props) =>
  renderHook((p: Props) => usePrConversation(p.tabId, p.enabled, p.prFetchedAt), { initialProps });

describe('usePrConversation', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('loads the conversation for a PR', async () => {
    // given
    const conversation = vi.fn(() => Promise.resolve([comment]));
    fakeMaple({ pr: { conversation } });
    // when
    const { result } = render();
    // then
    await waitFor(() => {
      expect(result.current.comments).toEqual([comment]);
    });
    expect(conversation).toHaveBeenCalledWith('t1');
  });

  test('loads nothing without a PR', async () => {
    // given
    const conversation = vi.fn(() => Promise.resolve([comment]));
    fakeMaple({ pr: { conversation } });
    // when
    const { result } = render({ ...props, enabled: false });
    await act(() => Promise.resolve());
    // then
    expect(conversation).not.toHaveBeenCalled();
    expect(result.current.comments).toEqual([]);
  });

  test('reloads after reload is called', async () => {
    // given
    const conversation = vi.fn(() => Promise.resolve([]));
    fakeMaple({ pr: { conversation } });
    const { result } = render();
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      result.current.reload();
    });
    // then
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(2);
    });
  });

  test('reloads when the PR poll time changes', async () => {
    // given
    const conversation = vi.fn(() => Promise.resolve([]));
    fakeMaple({ pr: { conversation } });
    const { rerender } = render();
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(1);
    });
    // when
    rerender({ ...props, prFetchedAt: '2026-10-25T12:00:00.000Z' });
    // then
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(2);
    });
  });

  test('keeps the last comments when a reload fails', async () => {
    // given
    const conversation = vi
      .fn<() => Promise<PrComment[]>>()
      .mockResolvedValueOnce([comment])
      .mockRejectedValue(new Error('listing PR comments: offline'));
    fakeMaple({ pr: { conversation } });
    const { result } = render();
    await waitFor(() => {
      expect(result.current.comments).toEqual([comment]);
    });
    // when
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(2);
    });
    await act(() => Promise.resolve());
    // then
    expect(result.current.comments).toEqual([comment]);
  });

  test('reloads when the session dot changes', async () => {
    // given
    const conversation = vi.fn(() => Promise.resolve([]));
    fakeMaple({ pr: { conversation } });
    render();
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(1);
    });
    // when
    act(() => {
      useMaple.setState({
        statuses: {
          t1: { tabId: 't1', dot: 'idle', sessionAlive: true, exitCode: null, resumeFailed: false, sync: null },
        },
      });
    });
    // then
    await waitFor(() => {
      expect(conversation).toHaveBeenCalledTimes(2);
    });
  });

  test('ignores an earlier load that finishes after a newer one', async () => {
    // given
    let finishFirst: (next: PrComment[]) => void = () => undefined;
    const newer = { ...comment, url: 'newer', body: 'newer' };
    const conversation = vi
      .fn<() => Promise<PrComment[]>>()
      .mockImplementationOnce(
        () =>
          new Promise<PrComment[]>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue([newer]);
    fakeMaple({ pr: { conversation } });
    const { result, rerender } = render();
    rerender({ ...props, prFetchedAt: '2026-10-25T12:00:00.000Z' });
    await waitFor(() => {
      expect(result.current.comments).toEqual([newer]);
    });
    // when
    await act(async () => {
      finishFirst([comment]);
      await Promise.resolve();
    });
    // then
    expect(result.current.comments).toEqual([newer]);
  });
});
