import type { Card, Sprint } from '@shared/types/jira';
import type { Dot, TabState, TabStatus } from '@shared/types/tabs';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { Inbox } from './Inbox';

const tab = (id: string, projectKey: string, kind: TabState['kind'], cardKey: string | null): TabState => ({
  id,
  projectKey,
  kind,
  cardKey,
  sessionId: `s-${id}`,
  worktreePath: null,
});
const status = (tabId: string, dot: Dot): TabStatus => ({
  tabId,
  dot,
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
});
const card = (key: string, points: number | null): Card => ({
  key,
  summary: key,
  status: 'In Review',
  points,
  labels: [],
  blockedBy: [],
  epic: null,
  descriptionMd: '',
  url: `https://jira/${key}`,
});
const sprint = (cards: Card[]) => ({
  data: { id: 1, name: 'Sprint', startDate: '2026-10-13', endDate: '2026-10-27', cards } satisfies Sprint,
  error: null,
  fetchedAt: '2026-10-19T10:00:00.000Z',
});
const minutesAgo = (m: number) => Date.now() - m * 60_000;

describe('Inbox', () => {
  beforeEach(() => {
    fakeMaple({
      jira: {
        sprint: vi.fn((key: string) =>
          Promise.resolve(key === 'DIG' ? sprint([card('DIG-1', 3)]) : sprint([card('BEAR-2', 5)])),
        ),
      },
    });
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({
      config: FAKE_CONFIG,
      projectKey: 'BEAR',
      tabs: [
        tab('t1', 'BEAR', 'card', 'BEAR-1'),
        tab('t2', 'BEAR', 'card', 'BEAR-2'),
        tab('t3', 'DIG', 'card', 'DIG-1'),
        tab('p1', 'DIG', 'planner', null),
      ],
      statuses: {
        t1: status('t1', 'working'),
        t2: status('t2', 'waiting'),
        t3: status('t3', 'ready'),
      },
      since: { t1: minutesAgo(40), t2: minutesAgo(10), t3: minutesAgo(25) },
    });
  });

  test('shows the count of tabs needing Taylor', () => {
    // given
    render(<Inbox />);
    // when
    const button = screen.getByRole('button', { name: /^Inbox/ });
    // then
    expect(button).toHaveTextContent('Inbox 2');
  });

  test('opening lists items oldest first with project and dot, and the ready points total', async () => {
    // given
    useMaple.setState({
      tabs: [...useMaple.getState().tabs, tab('t4', 'DIG', 'card', 'DIG-9')],
      statuses: { ...useMaple.getState().statuses, t4: status('t4', 'waiting') },
      since: { ...useMaple.getState().since, t4: minutesAgo(5) },
    });
    render(<Inbox />);
    // when
    await userEvent.click(screen.getByRole('button', { name: /^Inbox/ }));
    // then
    expect(await screen.findByText('Ready: 3 pts')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((r) => r.textContent);
    expect(rows).toEqual(['DIG-1 · Dig Days · ready', 'BEAR-2 · Bearclave · waiting', 'DIG-9 · Dig Days · waiting']);
  });

  test('clicking a card row selects its project and activates the tab', async () => {
    // given
    const selectProject = vi.fn();
    const activate = vi.fn();
    useMaple.setState({ selectProject, activate });
    render(<Inbox />);
    await userEvent.click(screen.getByRole('button', { name: /^Inbox/ }));
    // when
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-1/ }));
    // then
    expect(selectProject).toHaveBeenCalledWith('DIG');
    expect(activate).toHaveBeenLastCalledWith('t3');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('clicking a planner row selects its project and shows Home', async () => {
    // given
    const selectProject = vi.fn();
    const activate = vi.fn();
    useMaple.setState({
      selectProject,
      activate,
      statuses: { ...useMaple.getState().statuses, p1: status('p1', 'waiting') },
      since: { ...useMaple.getState().since, p1: minutesAgo(1) },
    });
    render(<Inbox />);
    await userEvent.click(screen.getByRole('button', { name: /^Inbox/ }));
    // when
    await userEvent.click(await screen.findByRole('button', { name: /^Planner/ }));
    // then
    expect(selectProject).toHaveBeenCalledWith('DIG');
    expect(activate).toHaveBeenLastCalledWith(null);
  });

  test('clicking a vault row selects its project and activates the vault tab', async () => {
    // given
    const selectProject = vi.fn();
    const activate = vi.fn();
    useMaple.setState({
      selectProject,
      activate,
      tabs: [...useMaple.getState().tabs, tab('v1', 'DIG', 'vault', null)],
      statuses: { ...useMaple.getState().statuses, v1: status('v1', 'waiting') },
      since: { ...useMaple.getState().since, v1: minutesAgo(1) },
    });
    render(<Inbox />);
    await userEvent.click(screen.getByRole('button', { name: /^Inbox/ }));
    // when
    await userEvent.click(await screen.findByRole('button', { name: /^Vault/ }));
    // then
    expect(selectProject).toHaveBeenCalledWith('DIG');
    expect(activate).toHaveBeenLastCalledWith('v1');
  });

  test('a visited tab leaves the inbox until its dot changes again', async () => {
    // given
    render(<Inbox />);
    const button = screen.getByRole('button', { name: /^Inbox/ });
    await userEvent.click(button);
    await userEvent.click(await screen.findByRole('button', { name: /^DIG-1/ }));
    const afterVisit = button.textContent;
    act(() => {
      useMaple.getState().activate('t1');
    });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    // when
    act(() => {
      useMaple.getState().setStatus(status('t3', 'waiting'));
    });
    // then
    vi.restoreAllMocks();
    expect(afterVisit).toBe('Inbox 1');
    expect(button).toHaveTextContent('Inbox 2');
  });

  test('clicking the button again closes the list', async () => {
    // given
    render(<Inbox />);
    const button = screen.getByRole('button', { name: /^Inbox/ });
    await userEvent.click(button);
    await screen.findByRole('list');
    // when
    await userEvent.click(button);
    // then
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('says nothing needs Taylor when there are no items', async () => {
    // given
    useMaple.setState({ statuses: {} });
    render(<Inbox />);
    // when
    await userEvent.click(screen.getByRole('button', { name: /^Inbox/ }));
    // then
    expect(await screen.findByText('Nothing needs you')).toBeInTheDocument();
  });
});
