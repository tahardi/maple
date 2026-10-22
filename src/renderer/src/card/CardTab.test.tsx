import type { Card, PrInfo, TabState, VaultNote } from '@shared/types';
import type { PaneAction } from '../claude/ClaudePane';
import { act, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { CardTab } from './CardTab';
import { TerminalPane } from './TerminalPane';

vi.mock('./monacoSetup', () => ({}));

vi.mock('../claude/ClaudePane', async () => {
  const { ActionBar } = await import('../claude/ActionBar');
  return {
    ClaudePane: ({ actions }: { actions: readonly PaneAction[] }) => <ActionBar actions={actions} />,
  };
});

vi.mock('./TerminalPane', () => ({
  TerminalPane: vi.fn(({ tabId }: { tabId: string }) => <div data-testid="terminal-pane">{tabId}</div>),
}));

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
  checks: { passed: 4, failed: 0, pending: 0, total: 4, runs: [] },
};

function fakeRepo(withPr: boolean) {
  fakeMaple({
    repo: {
      changes: () =>
        Promise.resolve({
          base: 'abc',
          files: [{ path: 'src/a.ts', status: 'M', oldPath: null, stamp: '1:1' }],
          added: 1,
          removed: 0,
        }),
      listFiles: () => Promise.resolve(['README.md', 'src/a.ts']),
    },
    pr: { get: () => Promise.resolve({ data: withPr ? pr : null, error: null, fetchedAt: null }) },
  });
}

function fakeVault(notes: readonly VaultNote[], written: readonly string[] = notes.map((note) => note.path)) {
  useMaple.setState({
    config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/vault' } },
  });
  const vault = {
    list: vi.fn(() => Promise.resolve([...notes])),
    read: vi.fn(() => Promise.resolve('## Findings')),
    written: vi.fn(() => Promise.resolve([...written])),
  };
  fakeMaple({ vault });
  return vault;
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
    const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
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
      const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
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
    const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
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

  test('opens the PR description on first load when the card has a PR', async () => {
    // given
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: { ...pr, body: '## Summary' }, error: null, fetchedAt: null }) },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('tab', { name: 'PR description', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
  });

  test('keeps the PR description closed until Full description opens it', async () => {
    // given
    fakeRepo(true);
    render(<CardTab tab={tab} />);
    await screen.findByRole('tab', { name: 'PR description' });
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close PR description' }));
    await userEvent.click(screen.getByText('a.ts'));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['a.ts']);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Full description' }));
    // then
    expect(screen.getByRole('tab', { name: 'PR description', selected: true })).toBeInTheDocument();
  });

  test('keeps a file opened before the PR exists active when the PR appears', async () => {
    // given
    const listeners: (() => void)[] = [];
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null, fetchedAt: null })
      .mockResolvedValue({ data: pr, error: null, fetchedAt: null });
    fakeMaple({
      repo: {
        listFiles: () => Promise.resolve(['README.md']),
        onChanged: (_tabId, callback) => {
          listeners.push(callback);
          return () => undefined;
        },
      },
      pr: { get },
    });
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByText('README.md'));
    // when
    act(() => {
      listeners.forEach((listener) => {
        listener();
      });
    });
    // then
    expect(await screen.findByRole('tab', { name: 'PR description', selected: false })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'README.md', selected: true })).toBeInTheDocument();
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
      vaultDir: null,
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
    const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
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
    const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
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

  function fakeApprove(
    paths: readonly string[] = ['src/a.ts'],
    approve = vi.fn<(tabId: string) => Promise<void>>(() => Promise.resolve()),
  ) {
    fakeMaple({
      repo: {
        changes: () =>
          Promise.resolve({
            base: 'abc',
            files: paths.map((path) => ({ path, status: 'M' as const, oldPath: null, stamp: '1:1' })),
            added: 1,
            removed: 0,
          }),
        listFiles: () => Promise.resolve(['README.md', ...paths]),
      },
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), approve },
    });
    return approve;
  }

  test.each([
    { name: 'one file', paths: ['src/a.ts'], text: '1 changed file not viewed. Approve anyway?' },
    { name: 'two files', paths: ['src/a.ts', 'src/b.ts'], text: '2 changed files not viewed. Approve anyway?' },
  ])('Approve asks first while a changed file is not viewed: $name', async ({ paths, text }) => {
    // given
    const approve = fakeApprove(paths);
    render(<CardTab tab={tab} />);
    await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' });
    const slot = within(screen.getByTestId('claude-slot'));
    // when
    await userEvent.click(await slot.findByRole('button', { name: 'Approve' }));
    // then
    expect(screen.getByRole('dialog')).toHaveTextContent(text);
    expect(approve).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'Approve anyway approves', button: 'Approve anyway', approved: true },
    { name: 'Cancel does not approve', button: 'Cancel', approved: false },
  ])('the unviewed files dialog: $name', async ({ button, approved }) => {
    // given
    const approve = fakeApprove();
    render(<CardTab tab={tab} />);
    await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' });
    await userEvent.click(await within(screen.getByTestId('claude-slot')).findByRole('button', { name: 'Approve' }));
    // when
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: button }));
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approve.mock.calls).toEqual(approved ? [['t1']] : []);
  });

  test('a failed Approve anyway shows its error', async () => {
    // given
    fakeApprove(
      ['src/a.ts'],
      vi.fn<(tabId: string) => Promise<void>>().mockRejectedValue(new Error('approving PR: offline')),
    );
    render(<CardTab tab={tab} />);
    await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' });
    const slot = within(screen.getByTestId('claude-slot'));
    await userEvent.click(await slot.findByRole('button', { name: 'Approve' }));
    // when
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve anyway' }));
    // then
    expect(await slot.findByRole('alert')).toHaveTextContent('approving PR: offline');
  });

  test('Approve goes straight through when every changed file is viewed', async () => {
    // given
    const approve = fakeApprove();
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' }));
    const slot = within(screen.getByTestId('claude-slot'));
    // when
    await userEvent.click(await slot.findByRole('button', { name: 'Approve' }));
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approve).toHaveBeenCalledWith('t1');
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

  test('the terminal panel is hidden at first and the Terminal button shows it', async () => {
    // given
    fakeMaple();
    render(<CardTab tab={tab} />);
    expect(screen.queryByTestId('terminal-pane')).not.toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    // then
    expect(screen.getByTestId('terminal-pane')).toBeVisible();
    expect(screen.getByTestId('terminal-pane')).toHaveTextContent('t1');
  });

  test('Ctrl+backtick hides the panel without closing anything', async () => {
    // given
    const close = vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false }));
    fakeMaple({ tabs: { close } });
    useMaple.setState({ activeTabId: 't1' });
    render(<CardTab tab={tab} />);
    await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    // when
    await userEvent.keyboard('{Control>}`{/Control}');
    // then
    expect(screen.getByTestId('terminal-pane')).not.toBeVisible();
    expect(close).not.toHaveBeenCalled();
  });

  test('showing the panel again keeps the same shell', async () => {
    // given
    const mounts = vi.fn();
    vi.mocked(TerminalPane).mockImplementation(({ tabId }: { tabId: string }) => {
      useEffect(mounts, []);
      return <div data-testid="terminal-pane">{tabId}</div>;
    });
    fakeMaple();
    render(<CardTab tab={tab} />);
    const button = screen.getByRole('button', { name: 'Terminal' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    // when
    await userEvent.click(button);
    // then
    expect(screen.getByTestId('terminal-pane')).toBeVisible();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(mounts).toHaveBeenCalledOnce();
  });

  test('a tab that stops being active stops toggling on Ctrl+backtick', async () => {
    // given
    fakeMaple();
    useMaple.setState({ activeTabId: 't1' });
    render(<CardTab tab={tab} />);
    act(() => {
      useMaple.setState({ activeTabId: 't2' });
    });
    // when
    await userEvent.keyboard('{Control>}`{/Control}');
    // then
    expect(screen.queryByTestId('terminal-pane')).not.toBeInTheDocument();
  });

  test.each([
    { name: 'the active tab', activeTabId: 't1', shown: true },
    { name: 'another tab', activeTabId: 't2', shown: false },
  ])('Ctrl+backtick toggles the panel only in $name', async ({ activeTabId, shown }) => {
    // given
    fakeMaple();
    useMaple.setState({ activeTabId });
    render(<CardTab tab={tab} />);
    // when
    await userEvent.keyboard('{Control>}`{/Control}');
    // then
    expect(screen.queryByTestId('terminal-pane') !== null).toBe(shown);
  });

  test('Ctrl+P opens quick open and the chosen file opens in the viewer', async () => {
    // given
    fakeRepo(false);
    useMaple.setState({ activeTabId: 't1' });
    render(<CardTab tab={tab} />);
    await screen.findByText('README.md');
    // when
    await userEvent.keyboard('{Control>}p{/Control}');
    await userEvent.type(screen.getByRole('textbox'), 'a.ts{Enter}');
    // then
    expect(screen.queryByRole('dialog', { name: 'Quick open' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test('Ctrl+Shift+F opens text search', async () => {
    // given
    const search = vi.fn(() => Promise.resolve([{ path: 'src/a.ts', line: 7, text: 'needle' }]));
    fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'src/a.ts']), search } });
    useMaple.setState({ activeTabId: 't1' });
    render(<CardTab tab={tab} />);
    await screen.findByText('README.md');
    // when
    await userEvent.keyboard('{Control>}{Shift>}F{/Shift}{/Control}');
    await userEvent.type(screen.getByRole('textbox'), 'needle{Enter}');
    await userEvent.click(await screen.findByRole('option', { name: 'src/a.ts:7 needle' }));
    // then
    expect(search).toHaveBeenCalledWith('t1', 'needle');
    expect(screen.queryByRole('dialog', { name: 'Search text' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test('Ctrl+P does nothing in a card tab that is not active', async () => {
    // given
    fakeRepo(false);
    useMaple.setState({ activeTabId: 'other' });
    render(<CardTab tab={tab} />);
    await screen.findByText('README.md');
    // when
    await userEvent.keyboard('{Control>}p{/Control}');
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('shows no vault switch without vaultDir', async () => {
    // given
    const list = vi.fn(() => Promise.resolve([]));
    fakeMaple({ vault: { list } });
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findAllByText('Waiting for worktree…')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Vault' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Worktree' })).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  test('a tab without a worktree defaults to the vault', async () => {
    // given
    const now = new Date().toISOString();
    fakeVault([
      { path: 'Inbox.md', modifiedAt: now },
      { path: 'Projects/Maple/Spike.md', modifiedAt: now },
    ]);
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findByText('Spike.md')).toBeInTheDocument();
    expect(screen.getByText('Inbox.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vault', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Worktree', pressed: false })).toBeInTheDocument();
    expect(screen.queryByText('Waiting for worktree…')).not.toBeInTheDocument();
  });

  test('a tab with a worktree defaults to the worktree', async () => {
    // given
    fakeVault([]);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('button', { name: 'Worktree', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vault', pressed: false })).toBeInTheDocument();
  });

  test('notes the card session wrote are marked changed', async () => {
    // given
    const now = new Date().toISOString();
    const { written } = fakeVault(
      [
        { path: 'Claude.md', modifiedAt: now },
        { path: 'Taylor.md', modifiedAt: now },
      ],
      ['Claude.md', 'Deleted.md'],
    );
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    expect(await screen.findByText('Claude.md')).toBeInTheDocument();
    // when
    const changedOnly = screen.queryByText('Taylor.md');
    await userEvent.click(screen.getByRole('button', { name: 'All files' }));
    // then
    expect(changedOnly).not.toBeInTheDocument();
    expect(written).toHaveBeenCalledWith('t1');
    expect(screen.getByRole('button', { name: 'Changed (1)' })).toBeInTheDocument();
    expect(screen.getByText('Claude.md').parentElement).toHaveTextContent('M');
    expect(screen.getByText('Taylor.md').parentElement).not.toHaveTextContent('M');
    expect(screen.queryByText('Deleted.md')).not.toBeInTheDocument();
  });

  test('choosing Worktree on a tab without a worktree shows the waiting text', async () => {
    // given
    fakeVault([{ path: 'Inbox.md', modifiedAt: new Date().toISOString() }]);
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    await screen.findByText('Inbox.md');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Worktree' }));
    // then
    expect(screen.getAllByText('Waiting for worktree…')).toHaveLength(2);
    expect(screen.queryByText('Inbox.md')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  test('choosing Vault on a tab with a worktree shows the notes', async () => {
    // given
    fakeVault([{ path: 'Inbox.md', modifiedAt: new Date().toISOString() }]);
    render(<CardTab tab={tab} />);
    await screen.findByRole('button', { name: 'Worktree', pressed: true });
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Vault' }));
    // then
    expect(await screen.findByText('Inbox.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vault', pressed: true })).toBeInTheDocument();
  });

  test('clicking a note opens it in the viewer', async () => {
    // given
    const { read } = fakeVault([{ path: 'Projects/Maple/Spike.md', modifiedAt: new Date().toISOString() }]);
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // when
    await userEvent.click(await screen.findByText('Spike.md'));
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Spike.md' })).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('Projects/Maple/Spike.md');
  });

  test('Refresh re-lists the vault', async () => {
    // given
    const { list, written } = fakeVault([{ path: 'Inbox.md', modifiedAt: new Date().toISOString() }]);
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    await screen.findByText('Inbox.md');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    // then
    expect(list).toHaveBeenCalledTimes(2);
    expect(written).toHaveBeenCalledTimes(2);
  });
});
