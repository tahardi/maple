import type { Card, PrInfo, TabState } from '@shared/types';
import type { PaneAction } from '../claude/ClaudePane';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { CardTab } from './CardTab';

vi.mock('./monacoSetup', () => ({}));

vi.mock('../claude/ClaudePane', async () => {
  const { ActionBar } = await import('../claude/ActionBar');
  return {
    ClaudePane: ({ actions }: { actions: readonly PaneAction[] }) => <ActionBar actions={actions} />,
  };
});

vi.mock('@monaco-editor/react', () => ({
  useMonaco: () => null,
  Editor: () => <div data-testid="editor" />,
  DiffEditor: () => <div data-testid="diff-editor" />,
}));

const tab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: 'MPL-20',
  sessionId: 's1',
  worktreePath: '/home/me/wts/maple-mpl-20-file-tree/',
};

const pr: PrInfo = {
  number: 13,
  url: 'https://github.com/tahardi/maple/pull/13',
  title: '[MPL-20] File Tree and PR Summary',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  checks: { passed: 4, failed: 0, pending: 0, total: 4 },
};

function fakeRepo(withPr: boolean) {
  fakeMaple({
    repo: {
      changes: () =>
        Promise.resolve({
          base: 'abc',
          files: [{ path: 'src/a.ts', status: 'M', oldPath: null }],
          added: 1,
          removed: 0,
        }),
      listFiles: () => Promise.resolve(['README.md', 'src/a.ts']),
    },
    pr: { get: () => Promise.resolve({ data: withPr ? pr : null, error: null, fetchedAt: null }) },
  });
}

describe('CardTab', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ config: FAKE_CONFIG });
    localStorage.clear();
  });

  test('shows the waiting text in the tree and viewer without a worktree', async () => {
    // given
    fakeMaple();
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findAllByText('Waiting for worktree…')).toHaveLength(2);
    expect(screen.getByTestId('viewer-slot')).toHaveTextContent('Waiting for worktree…');
    expect(screen.queryByRole('button', { name: 'All files' })).not.toBeInTheDocument();
  });

  test('shows Merged instead of waiting when the card is Done and the worktree is gone', async () => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status: 'Done',
      points: 3,
      labels: [],
      blockedBy: [],
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/MPL-20',
    };
    const sprint = { name: 'S1', startDate: '', endDate: '', cards: [card] };
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) } });
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findAllByText('Merged, worktree removed')).toHaveLength(2);
    expect(screen.getByTestId('viewer-slot')).toHaveTextContent('Merged, worktree removed');
    expect(screen.queryByText('Waiting for worktree…')).not.toBeInTheDocument();
  });

  test.each(['To Do', 'In Progress', 'In Review'] as const)(
    'shows the waiting text without a worktree when the card is %s',
    async (status) => {
      // given
      const card: Card = {
        key: 'MPL-20',
        summary: 'File Tree',
        status,
        points: 3,
        labels: [],
        blockedBy: [],
        descriptionMd: '',
        url: 'https://example.atlassian.net/browse/MPL-20',
      };
      const sprint = { name: 'S1', startDate: '', endDate: '', cards: [card] };
      fakeMaple({ jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) } });
      // when
      render(<CardTab tab={{ ...tab, worktreePath: null }} />);
      await screen.findByText('MPL-20 File Tree');
      // then
      expect(screen.getAllByText('Waiting for worktree…')).toHaveLength(2);
      expect(screen.queryByText('Merged, worktree removed')).not.toBeInTheDocument();
    },
  );

  test('shows the file tree instead of the merged text for a Done card that still has a worktree', async () => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status: 'Done',
      points: 3,
      labels: [],
      blockedBy: [],
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/MPL-20',
    };
    const sprint = { name: 'S1', startDate: '', endDate: '', cards: [card] };
    fakeMaple({
      repo: { listFiles: () => Promise.resolve(['README.md']) },
      jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) },
    });
    // when
    render(<CardTab tab={tab} />);
    await screen.findByText('MPL-20 File Tree');
    // then
    expect(await screen.findByRole('button', { name: 'All files' })).toBeInTheDocument();
    expect(screen.queryByText('Merged, worktree removed')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for worktree…')).not.toBeInTheDocument();
  });

  test.each([
    { name: 'All before a PR exists', withPr: false, pressed: 'All files' },
    { name: 'Changed once a PR exists', withPr: true, pressed: 'Changed (1)' },
  ])('defaults the toggle to $name', async ({ withPr, pressed }) => {
    // given
    fakeRepo(withPr);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('button', { name: pressed, pressed: true })).toBeInTheDocument();
  });

  test('shows the session cost in the header', async () => {
    // given
    fakeMaple({
      tabs: {
        cost: () =>
          Promise.resolve({
            inputTokens: 1200,
            outputTokens: 34000,
            cacheWriteTokens: 200000,
            cacheReadTokens: 1000000,
            dollars: 3.4,
          }),
      },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByText('1.2M tokens · $3.40')).toBeInTheDocument();
  });

  test('shows the branch from the worktree folder name', async () => {
    // given
    fakeRepo(true);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByText('mpl-20-file-tree')).toBeInTheDocument();
  });

  test('uses saved column widths', () => {
    // given
    fakeMaple();
    localStorage.setItem('maple.columns', '{"left":300,"right":40}');
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(screen.getByTestId('claude-slot')).toHaveStyle({ width: '40%' });
    expect(screen.getByTestId('viewer-slot').previousElementSibling?.previousElementSibling).toHaveStyle({
      width: '300px',
    });
  });

  test('opens tree selections as file tabs and closes them', async () => {
    // given
    fakeRepo(false);
    render(<CardTab tab={tab} />);
    // when
    await userEvent.click(await screen.findByText('README.md'));
    await userEvent.click(screen.getByText('a.ts'));
    await userEvent.click(screen.getByText('README.md', { selector: 'li span' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['README.md', 'a.ts']);
    expect(screen.getByRole('tab', { name: 'README.md', selected: true })).toBeInTheDocument();
    expect(screen.getByTestId('viewer-slot')).not.toHaveTextContent('Waiting for worktree…');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close README.md' }));
    // then
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test('keeps the active file when closing another file tab', async () => {
    // given
    fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'a.ts', 'b.ts']) } });
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByText('README.md'));
    await userEvent.click(screen.getByText('a.ts'));
    await userEvent.click(screen.getByText('b.ts'));
    await userEvent.click(screen.getByText('README.md', { selector: 'li span' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close a.ts' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['README.md', 'b.ts']);
    expect(screen.getByRole('tab', { name: 'README.md', selected: true })).toBeInTheDocument();
  });

  test('clears the selection when the last file tab closes', async () => {
    // given
    fakeRepo(false);
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByText('README.md'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close README.md' }));
    // then
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('README.md').closest('li')?.className).not.toMatch(/selected/);
  });

  test('shows the config actions and Approve in the Claude pane', async () => {
    // given
    const sendPrompt = vi.fn();
    const approve = vi.fn(() => Promise.resolve());
    fakeMaple({
      session: { sendPrompt },
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), approve },
    });
    const config = {
      worktreesDir: '',
      notifications: false,
      projects: [],
      actions: [{ label: 'Sync', prompt: 'Sync {key}' }],
    };
    useMaple.setState({ config: { ...FAKE_CONFIG, data: config } });
    render(<CardTab tab={tab} />);
    const slot = within(screen.getByTestId('claude-slot'));
    // when
    await userEvent.click(slot.getByRole('button', { name: 'Sync' }));
    await userEvent.click(await slot.findByRole('button', { name: 'Approve' }));
    // then
    expect(sendPrompt).toHaveBeenCalledWith('t1', 'Sync MPL-20');
    expect(approve).toHaveBeenCalledWith('t1');
  });

  test.each([
    { name: 'a Done card without a worktree', status: 'Done', worktreePath: null, shown: true },
    { name: 'a Done card with a worktree', status: 'Done', worktreePath: tab.worktreePath, shown: false },
    { name: 'an In Review card without a worktree', status: 'In Review', worktreePath: null, shown: false },
  ] as const)('the merged notice for $name is shown: $shown', async ({ status, worktreePath, shown }) => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status,
      points: 3,
      labels: [],
      blockedBy: [],
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/MPL-20',
    };
    const sprint = { name: 'S1', startDate: '', endDate: '', cards: [card] };
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) } });
    // when
    render(<CardTab tab={{ ...tab, worktreePath }} />);
    await screen.findByText('MPL-20 File Tree');
    // then
    const slot = within(screen.getByTestId('claude-slot'));
    expect(slot.queryByText('Merged') !== null).toBe(shown);
    expect(slot.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  test('Close tab on the merged notice closes the tab', async () => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status: 'Done',
      points: 3,
      labels: [],
      blockedBy: [],
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/MPL-20',
    };
    const sprint = { name: 'S1', startDate: '', endDate: '', cards: [card] };
    const close = vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false }));
    fakeMaple({
      jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) },
      tabs: { close },
    });
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'Close tab' }));
    // then
    expect(close).toHaveBeenCalledWith('t1', false);
  });

  test('a failed Approve shows its error until the next Approve', async () => {
    // given
    const approve = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('approving PR: offline'))
      .mockResolvedValueOnce(undefined);
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), approve } });
    render(<CardTab tab={tab} />);
    const slot = within(screen.getByTestId('claude-slot'));
    // when
    await userEvent.click(await slot.findByRole('button', { name: 'Approve' }));
    // then
    expect(await slot.findByRole('alert')).toHaveTextContent('approving PR: offline');
    // when
    await userEvent.click(slot.getByRole('button', { name: 'Approve' }));
    // then
    expect(slot.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each([
    { name: 'a plain error', reason: new Error('approving PR: offline') },
    {
      name: 'an error with the Electron IPC prefix',
      reason: new Error("Error invoking remote method 'pr:approve': Error: approving PR: offline"),
    },
    { name: 'a non-Error value', reason: 'approving PR: offline' },
  ])('a failed Approve with $name shows only the message', async ({ reason }) => {
    // given
    fakeMaple({
      pr: {
        get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }),
        approve: vi.fn<() => Promise<void>>().mockRejectedValue(reason),
      },
    });
    render(<CardTab tab={tab} />);
    const slot = within(screen.getByTestId('claude-slot'));
    // when
    await userEvent.click(await slot.findByRole('button', { name: 'Approve' }));
    // then
    expect(await slot.findByRole('alert')).toHaveTextContent(/^approving PR: offline$/);
  });

  test('a working tab disables Approve', async () => {
    // given
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }) } });
    useMaple.setState({
      statuses: { t1: { tabId: 't1', dot: 'working', sessionAlive: true, exitCode: null, resumeFailed: false } },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    const approve = await within(screen.getByTestId('claude-slot')).findByRole('button', { name: 'Approve' });
    await vi.waitFor(() => {
      expect(approve).toHaveAttribute('title', 'Agent is working');
    });
    expect(approve).toBeDisabled();
  });
});
