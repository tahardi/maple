import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapleApi } from '@shared/api/mapleApi';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { ApplyDecisionsButton } from './ApplyDecisionsButton';

function statusOf(overrides: Partial<TabStatus> = {}): TabStatus {
  return {
    tabId: 't1',
    dot: 'idle',
    sessionAlive: true,
    exitCode: null,
    resumeFailed: false,
    sync: null,
    ...overrides,
  };
}

describe('ApplyDecisionsButton', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('calls apply with the tab and shows Sending… while it waits', async () => {
    // given
    let finish = (): void => undefined;
    const apply = vi.fn<MapleApi['findings']['apply']>(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fakeMaple({ findings: { apply } });
    useMaple.setState({ statuses: { t1: statusOf() } });
    render(<ApplyDecisionsButton tabId="t1" />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Apply decisions' }));
    // then
    expect(apply).toHaveBeenCalledWith('t1');
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    finish();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply decisions' })).toBeEnabled();
    });
  });

  test('shows the error when apply fails', async () => {
    // given
    const apply = vi.fn<MapleApi['findings']['apply']>(() =>
      Promise.reject(new Error('applying decisions: nothing to hand over')),
    );
    fakeMaple({ findings: { apply } });
    useMaple.setState({ statuses: { t1: statusOf() } });
    render(<ApplyDecisionsButton tabId="t1" />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Apply decisions' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('applying decisions: nothing to hand over');
  });

  test.each([
    { name: 'the dot is working', status: statusOf({ dot: 'working' }), reason: 'Claude is working' },
    {
      name: 'the session is not alive',
      status: statusOf({ sessionAlive: false }),
      reason: 'The session is not running',
    },
    { name: 'there is no status', status: null, reason: 'The session is not running' },
  ])('is disabled with "$reason" when $name', ({ status, reason }) => {
    // given
    fakeMaple();
    useMaple.setState({ statuses: status === null ? {} : { t1: status } });
    // when
    render(<ApplyDecisionsButton tabId="t1" />);
    // then
    expect(screen.getByRole('button', { name: 'Apply decisions' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
  });
});
