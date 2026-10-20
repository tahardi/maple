import type { TabState } from '@shared/types';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { card, SPRINT } from '../testing/sprintFixture';
import { HomeTab } from './HomeTab';

vi.mock('../claude/ClaudePane', () => ({
  ClaudePane: () => <div data-testid="claude-pane" />,
}));

const tab = (id: string, cardKey: string): TabState => ({
  id,
  projectKey: 'DIG',
  kind: 'card',
  cardKey,
  sessionId: `s-${id}`,
  worktreePath: null,
});

const WITH_DIG_46 = { ...SPRINT, cards: [...SPRINT.cards, card('DIG-46', 'To Do')] };

const READY = {
  ...SPRINT,
  cards: [
    card('DIG-41', 'To Do'),
    card('DIG-42', 'To Do', { blockedBy: [{ key: 'DIG-40', status: 'Done' }] }),
    card('DIG-43', 'To Do', { blockedBy: [{ key: 'DIG-45', status: 'In Review' }] }),
    card('DIG-44', 'To Do', { labels: ['needs-taylor'] }),
  ],
};

function batchEvents() {
  let emit: (keys: string[]) => void = () => undefined;
  return {
    onBatch: (_projectKey: string, cb: (keys: string[]) => void) => {
      emit = cb;
      return vi.fn();
    },
    emit: (keys: string[]) => {
      act(() => {
        emit(keys);
      });
    },
  };
}

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

  test('a failed Start shows the error until another card is selected', async () => {
    // given
    const startCard = vi.fn(() =>
      Promise.reject(new Error("Error invoking remote method 'tabs:startCard': Error: creating worktree: exists")),
    );
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) },
    });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-41/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^creating worktree: exists$/);
    await userEvent.click(screen.getByRole('button', { name: /^DIG-44/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each([
    { name: 'IPC prefix', reason: new Error("Error invoking remote method 'tabs:startCard': Error: x"), want: 'x' },
    {
      name: 'IPC prefix without Error:',
      reason: new Error("Error invoking remote method 'tabs:startCard': x"),
      want: 'x',
    },
    { name: 'plain Error', reason: new Error('starting card: x'), want: 'starting card: x' },
  ])('a Start rejected with $name shows "$want"', async ({ reason, want }) => {
    // given
    fakeMaple({
      tabs: { startCard: () => Promise.reject(reason) },
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) },
    });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-41/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`^${want}$`));
  });

  test('a successful Open clears an earlier error', async () => {
    // given
    const openCard = vi
      .fn()
      .mockRejectedValueOnce(new Error('opening card: no worktree'))
      .mockResolvedValue(tab('t8', 'DIG-44'));
    fakeMaple({
      tabs: { openCard },
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) },
    });
    useMaple.setState({ activate: vi.fn() });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-44/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('opening card: no worktree');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    // then
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  test('a batch highlights only keys in To Do', async () => {
    // given
    let emit: (keys: string[]) => void = () => undefined;
    const sprint = { ...SPRINT, cards: [...SPRINT.cards, card('DIG-46', 'To Do')] };
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) },
      session: {
        onBatch: (_projectKey, cb) => {
          emit = cb;
          return vi.fn();
        },
      },
    });
    render(<HomeTab projectKey="DIG" />);
    await screen.findByTestId('claude-pane');
    // when
    act(() => {
      emit(['DIG-46', 'DIG-44', 'DIG-99', 'DIG-41']);
    });
    // then
    expect(await screen.findByRole('button', { name: 'Start (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^DIG-46/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-41/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-44/ })).not.toHaveAttribute('data-highlighted', 'true');
  });

  test('Start starts batch cards in board order and activates the first new tab', async () => {
    // given
    let emit: (keys: string[]) => void = () => undefined;
    const sprint = { ...SPRINT, cards: [...SPRINT.cards, card('DIG-46', 'To Do')] };
    const started: string[] = [];
    const startCard = vi.fn((_projectKey: string, cardKey: string) => {
      started.push(cardKey);
      return Promise.resolve(tab(`t-${cardKey}`, cardKey));
    });
    const activate = vi.fn();
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) },
      session: {
        onBatch: (_projectKey, cb) => {
          emit = cb;
          return vi.fn();
        },
      },
    });
    useMaple.setState({ activate });
    render(<HomeTab projectKey="DIG" />);
    await screen.findByTestId('claude-pane');
    act(() => {
      emit(['DIG-46', 'DIG-41']);
    });
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'Start (2)' }));
    // then
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith('t-DIG-41');
    });
    expect(started).toEqual(['DIG-41', 'DIG-46']);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('Suggest next batch clears the highlight', async () => {
    // given
    const { onBatch, emit } = batchEvents();
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: WITH_DIG_46, error: null, fetchedAt: null }) },
      session: { onBatch },
    });
    render(<HomeTab projectKey="DIG" />);
    await screen.findByTestId('claude-pane');
    emit(['DIG-46']);
    expect(await screen.findByRole('button', { name: /^DIG-46/ })).toHaveAttribute('data-highlighted', 'true');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Suggest next batch' }));
    // then
    expect(screen.getByRole('button', { name: /^DIG-46/ })).not.toHaveAttribute('data-highlighted');
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument();
  });

  test('a batch with no To Do keys shows Nothing to start', async () => {
    // given
    const { onBatch, emit } = batchEvents();
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: SPRINT, error: null, fetchedAt: null }) },
      session: { onBatch },
    });
    render(<HomeTab projectKey="DIG" />);
    await screen.findByTestId('claude-pane');
    // when
    emit(['DIG-44', 'DIG-99']);
    // then
    expect(await screen.findByText('Nothing to start right now')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument();
  });

  test('Start waits for each card before starting the next', async () => {
    // given
    const { onBatch, emit } = batchEvents();
    let finish: () => void = () => undefined;
    const startCard = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<TabState>((resolve) => {
          finish = () => {
            resolve(tab('t-DIG-41', 'DIG-41'));
          };
        }),
      )
      .mockResolvedValue(tab('t-DIG-46', 'DIG-46'));
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: WITH_DIG_46, error: null, fetchedAt: null }) },
      session: { onBatch },
    });
    render(<HomeTab projectKey="DIG" />);
    await screen.findByTestId('claude-pane');
    emit(['DIG-46', 'DIG-41']);
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'Start (2)' }));
    // then
    expect(startCard).toHaveBeenCalledTimes(1);
    act(() => {
      finish();
    });
    await waitFor(() => {
      expect(startCard).toHaveBeenCalledTimes(2);
    });
    expect(startCard).toHaveBeenLastCalledWith('DIG', 'DIG-46');
  });

  test('a card that leaves To Do after a refresh drops out of the selection', async () => {
    // given
    const { onBatch, emit } = batchEvents();
    const moved = {
      ...WITH_DIG_46,
      cards: WITH_DIG_46.cards.map((c) => (c.key === 'DIG-46' ? { ...c, status: 'In Progress' as const } : c)),
    };
    const sprint = vi
      .fn()
      .mockResolvedValueOnce({ data: WITH_DIG_46, error: null, fetchedAt: null })
      .mockResolvedValue({ data: moved, error: null, fetchedAt: null });
    fakeMaple({ jira: { sprint }, session: { onBatch } });
    render(<HomeTab projectKey="DIG" />);
    await screen.findByTestId('claude-pane');
    emit(['DIG-46', 'DIG-41']);
    expect(await screen.findByRole('button', { name: 'Start (2)' })).toBeInTheDocument();
    // when
    window.dispatchEvent(new Event('focus'));
    // then
    expect(await screen.findByRole('button', { name: 'Start (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^DIG-46/ })).not.toHaveAttribute('data-highlighted');
  });

  test('Select ready selects the ready cards', async () => {
    // given
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) } });
    render(<HomeTab projectKey="DIG" />);
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'Select ready (2)' }));
    // then
    expect(screen.getByRole('button', { name: /^DIG-41/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-42/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-43/ })).not.toHaveAttribute('data-highlighted');
    expect(screen.getByRole('button', { name: /^DIG-44/ })).not.toHaveAttribute('data-highlighted');
    expect(screen.getByRole('button', { name: 'Start (2)' })).toBeInTheDocument();
  });

  test('Start starts the selected cards in board order and activates the first', async () => {
    // given
    const startCard = vi.fn((_projectKey: string, cardKey: string) => Promise.resolve(tab(`t-${cardKey}`, cardKey)));
    const activate = vi.fn();
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) },
    });
    useMaple.setState({ activate });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select DIG-42' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select DIG-41' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start (2)' }));
    // then
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith('t-DIG-41');
    });
    expect(startCard.mock.calls).toEqual([
      ['DIG', 'DIG-41'],
      ['DIG', 'DIG-42'],
    ]);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Start \(/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^DIG-41/ })).not.toHaveAttribute('data-highlighted');
  });

  test('a failed start stops and keeps the rest selected', async () => {
    // given
    const startCard = vi.fn(() =>
      Promise.reject(new Error("Error invoking remote method 'tabs:startCard': Error: creating worktree: exists")),
    );
    const activate = vi.fn();
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) },
    });
    useMaple.setState({ activate });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Select ready (2)' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start (2)' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^starting DIG-41: creating worktree: exists$/);
    expect(startCard).toHaveBeenCalledTimes(1);
    expect(activate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^DIG-41/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-42/ })).toHaveAttribute('data-highlighted', 'true');
  });

  test('a batch event replaces the selection', async () => {
    // given
    const { onBatch, emit } = batchEvents();
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) },
      session: { onBatch },
    });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select DIG-42' }));
    // when
    emit(['DIG-41', 'DIG-99']);
    // then
    expect(screen.getByRole('button', { name: /^DIG-41/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-42/ })).not.toHaveAttribute('data-highlighted');
    expect(screen.getByRole('button', { name: 'Start (1)' })).toBeInTheDocument();
  });

  test('clicking Select ready again clears the selection', async () => {
    // given
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) } });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select DIG-43' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select ready (2)' }));
    expect(screen.getByRole('button', { name: 'Start (3)' })).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Select ready (2)' }));
    // then
    expect(screen.queryByRole('button', { name: /^Start \(/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toEqual([]);
  });

  test('unticking a card removes it from the selection', async () => {
    // given
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) } });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Select ready (2)' }));
    // when
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select DIG-41' }));
    // then
    expect(screen.getByRole('button', { name: /^DIG-41/ })).not.toHaveAttribute('data-highlighted');
    expect(screen.getByRole('button', { name: 'Start (1)' })).toBeInTheDocument();
  });

  test('a failure after the first start keeps only the unstarted cards selected', async () => {
    // given
    const startCard = vi
      .fn()
      .mockResolvedValueOnce(tab('t-DIG-41', 'DIG-41'))
      .mockRejectedValueOnce(new Error('starting card: boom'));
    fakeMaple({
      tabs: { startCard },
      jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) },
    });
    useMaple.setState({ activate: vi.fn() });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Select ready (2)' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start (2)' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^starting DIG-42: starting card: boom$/);
    expect(screen.getByRole('button', { name: /^DIG-41/ })).not.toHaveAttribute('data-highlighted');
    expect(screen.getByRole('button', { name: /^DIG-42/ })).toHaveAttribute('data-highlighted', 'true');
  });

  test('Clear empties the selection and hides the failure', async () => {
    // given
    fakeMaple({
      tabs: { startCard: () => Promise.reject(new Error('starting card: boom')) },
      jira: { sprint: () => Promise.resolve({ data: READY, error: null, fetchedAt: null }) },
    });
    render(<HomeTab projectKey="DIG" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Select ready (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start (2)' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start \(/ })).not.toBeInTheDocument();
  });
});
