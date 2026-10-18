import type { TabState } from '@shared/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { SPRINT } from '../testing/sprintFixture';
import { HomeTab } from './HomeTab';

const tab = (id: string, cardKey: string): TabState => ({
  id,
  projectKey: 'DIG',
  kind: 'card',
  cardKey,
  sessionId: `s-${id}`,
  worktreePath: null,
});

describe('HomeTab', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ projectKey: 'DIG' });
  });

  test.each([
    { fetchedAt: '2026-10-17T14:02:00', want: 'Jira unreachable, last updated 14:02' },
    { fetchedAt: null, want: 'Jira unreachable' },
  ])('shows "$want" above the old data', async ({ fetchedAt, want }) => {
    // given
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: 'fetching sprint: timed out', fetchedAt }) },
    });
    // when
    render(<HomeTab projectKey="DIG" />);
    // then
    expect(await screen.findByRole('status')).toHaveTextContent(new RegExp(`^${want}$`));
    expect(screen.getByRole('button', { name: /^DIG-44/ })).toBeInTheDocument();
  });

  test('shows No active sprint', async () => {
    // given
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: null, error: null, fetchedAt: '2026-10-17T14:02:00' }) },
    });
    // when
    render(<HomeTab projectKey="DIG" />);
    // then
    expect(await screen.findByText('No active sprint')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('an error with no data shows only the banner', async () => {
    // given
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: null, error: 'fetching sprint: timed out', fetchedAt: null }) },
    });
    // when
    render(<HomeTab projectKey="DIG" />);
    // then
    expect(await screen.findByRole('status')).toHaveTextContent('Jira unreachable');
    expect(screen.queryByText('No active sprint')).not.toBeInTheDocument();
  });

  test('Start starts the card and activates its new tab', async () => {
    // given
    const startCard = vi.fn(() => Promise.resolve(tab('t9', 'DIG-41')));
    const activate = vi.fn();
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) },
    });
    useMaple.setState({ activate });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-41/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    // then
    expect(startCard).toHaveBeenCalledWith('DIG', 'DIG-41');
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith('t9');
    });
  });

  test('Open opens the card and activates its tab', async () => {
    // given
    const openCard = vi.fn(() => Promise.resolve(tab('t8', 'DIG-44')));
    const activate = vi.fn();
    fakeMaple({
      tabs: { openCard },
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) },
    });
    useMaple.setState({ activate });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-44/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    // then
    expect(openCard).toHaveBeenCalledWith('DIG', 'DIG-44');
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith('t8');
    });
  });

  test('Close hides the card detail', async () => {
    // given
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) } });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-44/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    // then
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  test('the card detail follows a refreshed sprint', async () => {
    // given
    const moved = {
      ...SPRINT,
      cards: SPRINT.cards.map((c) => (c.key === 'DIG-41' ? { ...c, status: 'Done' as const } : c)),
    };
    const sprint = vi
      .fn()
      .mockResolvedValueOnce({ data: SPRINT, error: null, fetchedAt: null })
      .mockResolvedValue({ data: moved, error: null, fetchedAt: null });
    fakeMaple({ jira: { sprint } });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-41/ }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    // when
    window.dispatchEvent(new Event('focus'));
    // then
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('complementary')).toHaveTextContent('Done');
  });

  test('Go to tab activates the existing tab', async () => {
    // given
    const activate = vi.fn();
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) } });
    useMaple.setState({ activate, tabs: [tab('t1', 'DIG-44')] });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-44/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Go to tab' }));
    // then
    expect(activate).toHaveBeenCalledWith('t1');
  });
});
