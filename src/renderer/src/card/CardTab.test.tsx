import type { Card } from '@shared/types/jira/card';
import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
import type { TabState } from '@shared/types/tabs/tabState';
import type { VaultNote } from '@shared/types/files/vaultNote';
import type { PaneAction } from '../claude/ClaudePane';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { card, SPRINT } from '../testing/sprintFixture';
import { finding, findingsFile } from '../testing/findingsFixture';
import { CardTab } from './CardTab';
import { TerminalPane } from '@renderer/card/terminal/TerminalPane';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));

vi.mock('../claude/ClaudePane', async () => {
  const { ActionBar } = await import('../claude/ActionBar');
  return {
    ClaudePane: ({ actions, approve }: { actions: readonly PaneAction[]; approve?: ReactNode }) => (
      <ActionBar actions={actions}>{approve}</ActionBar>
    ),
  };
});

vi.mock('@renderer/card/terminal/TerminalPane', () => ({
  TerminalPane: vi.fn(({ tabId }: { tabId: string }) => <div data-testid="terminal-pane">{tabId}</div>),
}));

const editorChange = vi.hoisted(() => {
  const change: { value: (text: string) => void } = { value: () => undefined };
  return change;
});

vi.mock('@monaco-editor/react', () => ({
  useMonaco: () => null,
  Editor: (props: { onChange: (value: string | undefined, change: { isFlush: boolean }) => void }) => {
    editorChange.value = (text) => {
      props.onChange(text, { isFlush: false });
    };
    return <div data-testid="editor" />;
  },
  DiffEditor: () => <div data-testid="diff-editor" />,
}));

const tab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: 'MPL-20',
  sessionId: 's1',
  worktreePath: '/home/me/wts/maple-mpl-20-file-tree/',
  worktreePaths: [],
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
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 4, failed: 0, pending: 0, total: 4, runs: [] },
};

const head = 'a'.repeat(40);

async function clickApprove() {
  await userEvent.click(
    await within(screen.getByTestId('claude-slot')).findByRole('button', { name: 'Approve & merge' }),
  );
}

async function confirmApprove() {
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve & merge' }));
}

function reviewOf(paths: readonly string[]): () => Promise<Fetched<Review>> {
  const files = paths.map((path) => ({ path, status: 'M' as const, oldPath: null, stamp: 'f'.repeat(40) }));
  return () =>
    Promise.resolve({
      data: { number: 13, headSha: head, baseSha: 'c'.repeat(40), added: 9, removed: 4, files },
      error: null,
      fetchedAt: null,
    });
}

function undecidedFindings(count: number) {
  const file = findingsFile(Array.from({ length: count }, (_, i) => finding({ id: `F${String(i + 1)}` })));
  return vi.fn(() => Promise.resolve({ data: file, error: null, fetchedAt: null }));
}

function fakeRepo(withPr: boolean, cards: readonly Card[] = []) {
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
    jira: {
      sprint: () =>
        Promise.resolve({
          data: { id: 1, name: 'S1', startDate: '', endDate: '', cards: [...cards] },
          error: null,
          fetchedAt: null,
        }),
    },
  });
}

function captureRepoChanged(overrides: Parameters<typeof fakeMaple>[0]): { value: () => void } {
  const changed: { value: () => void } = { value: () => undefined };
  fakeMaple({
    ...overrides,
    repo: {
      onChanged: vi.fn((_tabId: string, cb: () => void) => {
        changed.value = cb;
        return vi.fn();
      }),
    },
  });
  return changed;
}

function fakeNoPr(status: Card['status']) {
  const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card('MPL-20', status)] };
  fakeMaple({
    pr: { get: () => Promise.resolve({ data: null, error: null, fetchedAt: '2026-10-18T12:00:00.000Z' }) },
    jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) },
  });
}

function fakeVault(
  notes: readonly VaultNote[],
  written: readonly string[] = notes.map((note) => note.path),
  cards: readonly Card[] = [],
) {
  useMaple.setState({
    config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/vault' } },
  });
  const vault = {
    list: vi.fn(() => Promise.resolve([...notes])),
    read: vi.fn(() => Promise.resolve('## Findings')),
    written: vi.fn(() => Promise.resolve([...written])),
  };
  fakeMaple({
    vault,
    jira: {
      sprint: () =>
        Promise.resolve({
          data: { id: 1, name: 'S1', startDate: '', endDate: '', cards: [...cards] },
          error: null,
          fetchedAt: null,
        }),
    },
  });
  return vault;
}

describe('CardTab', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ config: FAKE_CONFIG, activeTabId: 't1' });
    localStorage.clear();
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver() {
        return { observe: vi.fn(), disconnect: vi.fn() };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      epic: null,
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

  test('shows Closed instead of Merged when the card has the wont-do label', async () => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status: 'Done',
      points: 3,
      labels: ['wont-do'],
      blockedBy: [],
      epic: null,
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/MPL-20',
    };
    const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) } });
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findAllByText('Closed, worktree removed')).toHaveLength(2);
    expect(within(screen.getByTestId('claude-slot')).getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByText('Merged')).not.toBeInTheDocument();
  });

  test('shows the waiting text for a wont-do card that is not Done', async () => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status: 'In Review',
      points: 3,
      labels: ['wont-do'],
      blockedBy: [],
      epic: null,
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
    expect(screen.queryByText('Closed, worktree removed')).not.toBeInTheDocument();
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
        epic: null,
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
      epic: null,
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

  test('shows the checked-out branch in the header', async () => {
    // given
    fakeMaple({
      repo: {
        listFiles: () => Promise.resolve(['README.md']),
        info: () => Promise.resolve({ name: 'maple', branch: 'mpl-20-renamed', hasTry: false }),
      },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await within(screen.getByRole('banner')).findByText('mpl-20-renamed')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByText('mpl-20-file-tree')).toBeNull();
  });

  test('shows the new branch in the header after the branch changes', async () => {
    // given
    const listeners: (() => void)[] = [];
    let branch = 'mpl-20-file-tree';
    fakeMaple({
      repo: {
        listFiles: () => Promise.resolve(['README.md']),
        info: () => Promise.resolve({ name: 'maple', branch, hasTry: false }),
        onChanged: (_tabId, callback) => {
          listeners.push(callback);
          return () => undefined;
        },
      },
    });
    render(<CardTab tab={tab} />);
    await within(screen.getByRole('banner')).findByText('mpl-20-file-tree');
    // when
    branch = 'renamed-branch';
    act(() => {
      listeners.forEach((listener) => {
        listener();
      });
    });
    // then
    expect(await within(screen.getByRole('banner')).findByText('renamed-branch')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByText('mpl-20-file-tree')).toBeNull();
  });

  test('shows no branch in the header before the repo info loads', async () => {
    // given
    fakeRepo(true);
    // when
    render(<CardTab tab={tab} />);
    // then
    await screen.findByRole('button', { name: 'PR #13' });
    expect(within(screen.getByRole('banner')).queryByText('mpl-20-file-tree')).toBeNull();
  });

  test('uses saved column widths', () => {
    // given
    fakeMaple();
    localStorage.setItem('maple.columns.left', '300');
    localStorage.setItem('maple.columns.right', '40');
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(screen.getByTestId('claude-slot')).toHaveStyle({ width: '40%' });
    expect(screen.getByTestId('viewer-slot').previousElementSibling?.previousElementSibling).toHaveStyle({
      width: '300px',
    });
  });

  test('double-clicking the Claude handle restores its default width', () => {
    // given
    fakeMaple();
    localStorage.setItem('maple.columns.right', '40');
    render(<CardTab tab={tab} />);
    // when
    fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize Claude pane' }));
    // then
    expect(screen.getByTestId('claude-slot')).toHaveStyle({ width: '32%' });
  });

  test('uses the saved terminal height', async () => {
    // given
    fakeMaple();
    localStorage.setItem('maple.split.cardTerminal', '50');
    render(<CardTab tab={tab} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    // then
    expect(screen.getByTestId('terminal-pane').parentElement).toHaveStyle({ height: '50%' });
  });

  test('shows the terminal resize handle only while the terminal is shown', async () => {
    // given
    fakeMaple();
    render(<CardTab tab={tab} />);
    const handle = () => screen.queryByRole('separator', { name: 'Resize terminal' });
    expect(handle()).not.toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    // then
    expect(handle()).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    // then
    expect(handle()).not.toBeInTheDocument();
  });

  test('dragging a column divider saves the width once on release', () => {
    // given
    fakeMaple();
    render(<CardTab tab={tab} />);
    const divider = screen.getByTestId('viewer-slot').previousElementSibling;
    if (divider === null) {
      throw new Error('finding the column divider: missing');
    }
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      // when
      fireEvent.pointerDown(divider);
      act(() => {
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300 }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 320 }));
        window.dispatchEvent(new PointerEvent('pointerup'));
      });
      // then
      const leftWrites = setItem.mock.calls.filter(([key]) => key === 'maple.columns.left');
      expect(leftWrites).toEqual([['maple.columns.left', '320']]);
    } finally {
      setItem.mockRestore();
    }
  });

  test('marks the files that have review comments in the tree', async () => {
    // given
    fakeRepo(true);
    window.maple.pr.comments = vi.fn(() =>
      Promise.resolve([
        {
          id: 1,
          replyTo: null,
          startLine: null,
          path: 'src/a.ts',
          line: 1,
          author: 'tahardi',
          body: 'why?',
          threadId: null,
          resolved: false,
        },
      ]),
    );
    // when
    render(<CardTab tab={tab} />);
    // then
    const mark = await screen.findByRole('img', { name: 'Has review comments' });
    expect(mark.closest('li')).toHaveTextContent(/^a\.ts/);
  });

  test('opens tree selections as file tabs and closes them', async () => {
    // given
    fakeRepo(false);
    render(<CardTab tab={tab} />);
    // when
    await userEvent.dblClick(await screen.findByText('README.md'));
    await userEvent.dblClick(screen.getByText('a.ts'));
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

  const tabLabels = () => screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'));

  test.each([
    {
      name: 'a single click replaces the preview tab',
      setup: () => {
        fakeRepo(false);
      },
      steps: async () => {
        await userEvent.click(await screen.findByText('README.md'));
        await userEvent.click(screen.getByText('a.ts'));
      },
      want: ['a.ts'],
    },
    {
      name: 'double-clicking a file in the tree keeps it open',
      setup: () => {
        fakeRepo(false);
      },
      steps: async () => {
        await userEvent.dblClick(await screen.findByText('README.md'));
        await userEvent.click(screen.getByText('a.ts'));
      },
      want: ['README.md', 'a.ts'],
    },
    {
      name: 'double-clicking the preview tab keeps it open',
      setup: () => {
        fakeRepo(false);
      },
      steps: async () => {
        await userEvent.click(await screen.findByText('README.md'));
        await userEvent.dblClick(screen.getByRole('tab', { name: 'README.md' }));
        await userEvent.click(screen.getByText('a.ts'));
      },
      want: ['README.md', 'a.ts'],
    },
    {
      name: 'quick open replaces the preview tab',
      setup: () => {
        fakeRepo(false);
        useMaple.setState({ activeTabId: 't1' });
      },
      steps: async () => {
        await userEvent.click(await screen.findByText('README.md'));
        await userEvent.keyboard('{Control>}p{/Control}');
        await userEvent.type(screen.getByRole('textbox'), 'a.ts{Enter}');
      },
      want: ['a.ts'],
    },
    {
      name: 'descriptions open pinned',
      setup: () => {
        fakeRepo(true, [card('MPL-20', 'In Progress', { descriptionMd: '## Goal' })]);
      },
      steps: async () => {
        await screen.findByRole('tab', { name: 'PR description' });
        await userEvent.click(await screen.findByTitle(/Click to open the card description/));
        await userEvent.click(screen.getByRole('button', { name: 'All files' }));
        await userEvent.click(screen.getByText('README.md', { selector: 'li span' }));
        await userEvent.click(screen.getByText('a.ts'));
      },
      want: ['PR description', 'Card description', 'a.ts'],
    },
    {
      name: 'closing the preview tab makes the next file a new tab',
      setup: () => {
        fakeRepo(false);
      },
      steps: async () => {
        await userEvent.dblClick(await screen.findByText('README.md'));
        await userEvent.click(screen.getByText('a.ts'));
        await userEvent.click(screen.getByRole('button', { name: 'Close src/a.ts' }));
        await userEvent.click(screen.getByText('a.ts'));
      },
      want: ['README.md', 'a.ts'],
    },
    {
      name: 'Close All clears the preview',
      setup: () => {
        fakeRepo(false);
      },
      steps: async () => {
        await userEvent.click(await screen.findByText('README.md'));
        fireEvent.contextMenu(screen.getByRole('tab', { name: 'README.md' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Close All' }));
        await userEvent.click(screen.getByText('a.ts'));
      },
      want: ['a.ts'],
    },
    {
      name: 'Close Others on the preview tab keeps it replaceable',
      setup: () => {
        fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'a.ts', 'b.ts']) } });
      },
      steps: async () => {
        await userEvent.dblClick(await screen.findByText('README.md'));
        await userEvent.click(screen.getByText('a.ts'));
        fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'Close Others' }));
        await userEvent.click(screen.getByText('b.ts'));
      },
      want: ['b.ts'],
    },
  ])('$name', async ({ setup, steps, want }) => {
    // given
    setup();
    render(<CardTab tab={tab} />);
    // when
    await steps();
    // then
    expect(tabLabels()).toEqual(want);
    const italic = screen.getAllByRole('tab').filter((t) => /preview/.test(t.className));
    expect(italic.map((t) => t.getAttribute('aria-label'))).toEqual(want.slice(-1));
    expect(italic[0]).toHaveAttribute('aria-selected', 'true');
  });

  test('typing in the preview file keeps it open when another file opens', async () => {
    // given
    fakeMaple({
      repo: {
        listFiles: () => Promise.resolve(['README.md', 'a.ts']),
        readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current: 'one\n', base: 'one\n' }),
      },
    });
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByText('README.md'));
    await screen.findByTestId('editor');
    // when
    act(() => {
      editorChange.value('edited\n');
    });
    await userEvent.click(screen.getByText('a.ts'));
    // then
    expect(tabLabels()).toEqual(['● README.md', 'a.ts']);
  });

  test('vault notes share the preview tab until one is double-clicked', async () => {
    // given
    const now = new Date().toISOString();
    fakeVault([
      { path: 'One.md', modifiedAt: now },
      { path: 'Two.md', modifiedAt: now },
      { path: 'Three.md', modifiedAt: now },
    ]);
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // when
    await userEvent.click(await screen.findByText('One.md'));
    await userEvent.dblClick(screen.getByText('Two.md'));
    await userEvent.click(screen.getByText('Three.md'));
    // then
    expect(tabLabels()).toEqual(['Two.md', 'Three.md']);
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

  test('names the repo of a PR outside the project repo', async () => {
    // given
    fakeRepo(true);
    const project = {
      name: 'Xena',
      jiraKey: 'MPL',
      jiraBoardId: 1,
      plannerDir: '/tmp/planner/xena',
      repo: 'tahardi/xena',
      otherRepos: ['tahardi/maple'],
    };
    useMaple.setState({
      config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, projects: [project] } },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('button', { name: 'tahardi/maple PR #13' })).toBeInTheDocument();
  });

  test.each([
    { status: 'In Review' as const, name: 'shows', shown: true },
    { status: 'In Progress' as const, name: 'hides', shown: false },
    { status: 'To Do' as const, name: 'hides', shown: false },
    { status: 'Done' as const, name: 'hides', shown: false },
  ])('a $status card with no PR $name the searched repos', async ({ status, shown }) => {
    // given
    fakeNoPr(status);
    // when
    render(<CardTab tab={{ ...tab, projectKey: 'BEAR' }} />);
    await screen.findByRole('tab', { name: 'Card description', selected: true });
    // then
    expect(screen.queryByText('No PR in tahardi/bearclave') !== null).toBe(shown);
  });

  test('lists the project repo first, then its other repos, when no PR is found', async () => {
    // given
    fakeNoPr('In Review');
    const project = {
      name: 'Xena',
      jiraKey: 'MPL',
      jiraBoardId: 1,
      plannerDir: '/tmp/planner/xena',
      repo: 'tahardi/xena',
      otherRepos: ['tahardi/dotclaude'],
    };
    useMaple.setState({
      config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, projects: [project] } },
    });
    // when
    render(<CardTab tab={tab} />);
    await screen.findByRole('tab', { name: 'Card description', selected: true });
    // then
    expect(
      within(screen.getByRole('banner')).getByText('No PR in tahardi/xena, tahardi/dotclaude'),
    ).toBeInTheDocument();
  });

  test('names the searched repos for a card outside the sprint with no PR', async () => {
    // given
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: null, error: null, fetchedAt: '2026-10-18T12:00:00.000Z' }) },
      jira: { sprint: () => Promise.resolve({ data: { ...SPRINT, cards: [] }, error: null, fetchedAt: null }) },
    });
    // when
    render(<CardTab tab={{ ...tab, projectKey: 'BEAR' }} />);
    // then
    expect(await screen.findByText('No PR in tahardi/bearclave')).toBeInTheDocument();
  });

  test('shows no searched repos for a project missing from config', async () => {
    // given
    fakeNoPr('In Review');
    // when
    render(<CardTab tab={{ ...tab, projectKey: 'NOPE' }} />);
    await screen.findByRole('tab', { name: 'Card description', selected: true });
    // then
    expect(screen.queryByText(/No PR in/)).toBeNull();
  });

  test('keeps the PR description closed until the PR number opens it', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'PR #13' }));
    // then
    expect(screen.getByRole('tab', { name: 'PR description', selected: true })).toBeInTheDocument();
  });

  test('opens the card description on first load when the card has no PR', async () => {
    // given
    fakeRepo(false, [card('MPL-20', 'In Progress', { descriptionMd: '## Goal' })]);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('tab', { name: 'Card description', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Goal' })).toBeInTheDocument();
  });

  test('keeps the PR description active and the card description closed when the card has a PR', async () => {
    // given
    fakeRepo(true, [card('MPL-20', 'In Progress', { descriptionMd: '## Goal' })]);
    // when
    render(<CardTab tab={tab} />);
    await screen.findByTitle(/Click to open the card description/);
    // then
    expect(screen.getByRole('tab', { name: 'PR description', selected: true })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['PR description']);
  });

  test('the card title opens the card description', async () => {
    // given
    fakeRepo(true, [card('MPL-20', 'In Progress', { descriptionMd: '## Goal' })]);
    render(<CardTab tab={tab} />);
    await screen.findByRole('tab', { name: 'PR description' });
    // when
    await userEvent.click(await screen.findByTitle(/Click to open the card description/));
    // then
    expect(screen.getByRole('tab', { name: 'Card description', selected: true })).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close Card description' }));
    await userEvent.click(screen.getByTitle(/Click to open the card description/));
    // then
    expect(screen.getByRole('tab', { name: 'Card description', selected: true })).toBeInTheDocument();
  });

  test('keeps a closed card description closed when the card data reloads', async () => {
    // given
    const listeners: (() => void)[] = [];
    fakeMaple({
      repo: {
        listFiles: () => Promise.resolve(['README.md']),
        onChanged: (_tabId, callback) => {
          listeners.push(callback);
          return () => undefined;
        },
      },
      jira: {
        sprint: () =>
          Promise.resolve({
            data: { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card('MPL-20', 'In Progress')] },
            error: null,
            fetchedAt: null,
          }),
      },
    });
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Close Card description' }));
    // when
    act(() => {
      listeners.forEach((listener) => {
        listener();
      });
    });
    // then
    expect(await screen.findByTitle(/Click to open the card description/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Card description' })).not.toBeInTheDocument();
  });

  test('opens the card description in the vault view of a tab without a worktree', async () => {
    // given
    fakeVault([], [], [card('MPL-20', 'In Progress', { descriptionMd: '## Goal' })]);
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findByRole('tab', { name: 'Card description', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Goal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vault', pressed: true })).toBeInTheDocument();
  });

  test('the card title opens nothing without the card', async () => {
    // given
    fakeRepo(false);
    // when
    render(<CardTab tab={tab} />);
    await screen.findByText('README.md');
    // then
    expect(screen.queryByTitle(/Click to open the card description/)).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Card description' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: 'README.md', selected: true }).className).toMatch(/preview/);
  });

  test('shows nothing but the view switch above a single-repo tree', async () => {
    // given
    useMaple.setState({
      config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/vault' } },
    });
    fakeMaple({
      repo: {
        listFiles: () => Promise.resolve(['README.md']),
        info: () => Promise.resolve({ name: 'maple', branch: 'mpl-20-file-tree', hasTry: false }),
      },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    const slot = within(screen.getByTestId('tree-slot'));
    expect(await slot.findByText('README.md')).toBeInTheDocument();
    expect(await within(screen.getByRole('banner')).findByText('mpl-20-file-tree')).toBeInTheDocument();
    expect(slot.queryByText('maple')).toBeNull();
    expect(slot.queryByText('mpl-20-file-tree')).toBeNull();
    expect(slot.queryByRole('button', { name: /^Repo/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('tree-slot').firstElementChild).toContainElement(
      slot.getByRole('button', { name: 'Vault' }),
    );
  });

  test('shows no PR panel under the tree', async () => {
    // given
    fakeRepo(true);
    // when
    render(<CardTab tab={tab} />);
    // then
    await within(screen.getByRole('banner')).findByRole('button', { name: 'PR #13' });
    const slot = within(screen.getByTestId('tree-slot'));
    expect(slot.queryByRole('button', { name: 'PR #13' })).toBeNull();
    expect(slot.queryByText(pr.title)).toBeNull();
    expect(slot.queryByRole('heading', { name: 'Checks' })).toBeNull();
  });

  const twoRepos: TabState = {
    ...tab,
    worktreePath: '/wts/xena-xena-62-vm-net',
    worktreePaths: ['/wts/halo-xena-62-config', '/wts/xena-xena-62-vm-net'],
  };

  const xena = { name: 'xena', branch: 'xena-62-vm-net', hasTry: false };

  test('shows a repo dropdown above the tree when the card has more than one worktree', async () => {
    // given
    fakeMaple({ repo: { info: () => Promise.resolve(xena) } });
    // when
    render(<CardTab tab={twoRepos} />);
    // then
    const slot = within(screen.getByTestId('tree-slot'));
    const button = await slot.findByRole('button', { name: 'Repo: xena' });
    expect(within(button).queryByTestId('repo-branch')).toBeNull();
    expect(button).not.toHaveTextContent('xena-62-vm-net');
  });

  test('names the selected folder on the repo dropdown before the repo info loads', () => {
    // given
    fakeMaple();
    // when
    render(<CardTab tab={twoRepos} />);
    // then
    expect(screen.getByRole('button', { name: 'Repo: xena-xena-62-vm-net' })).toHaveTextContent('xena-xena-62-vm-net');
  });

  test('choosing another repo asks the main process to select it', async () => {
    // given
    const selectWorktree = vi.fn(() => Promise.resolve());
    fakeMaple({ repo: { info: () => Promise.resolve(xena) }, tabs: { selectWorktree } });
    render(<CardTab tab={twoRepos} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Repo: xena' }));
    // when
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'halo-xena-62-config' }));
    // then
    expect(selectWorktree).toHaveBeenCalledWith('t1', '/wts/halo-xena-62-config');
  });

  test('switching repos closes the old repo files and opens the new PR description', async () => {
    // given
    let current: PrInfo | null = null;
    fakeMaple({
      repo: { listFiles: () => Promise.resolve(['README.md']), info: () => Promise.resolve(xena) },
      pr: { get: () => Promise.resolve({ data: current, error: null, fetchedAt: null }) },
    });
    const { rerender } = render(<CardTab tab={twoRepos} />);
    await userEvent.dblClick(await screen.findByText('README.md'));
    expect(tabLabels()).toEqual(['README.md']);
    // when
    current = { ...pr, number: 12, body: '## Halo' };
    rerender(<CardTab tab={{ ...twoRepos, worktreePath: '/wts/halo-xena-62-config' }} />);
    // then
    expect(await screen.findByRole('tab', { name: 'PR description', selected: true })).toBeInTheDocument();
    expect(tabLabels()).toEqual(['PR description']);
    expect(await screen.findByRole('heading', { name: 'Halo' })).toBeInTheDocument();
  });

  test('switching to a repo without a PR leaves the PR description closed', async () => {
    // given
    let current: PrInfo | null = { ...pr, body: '## Xena' };
    fakeMaple({
      repo: { info: () => Promise.resolve(xena) },
      pr: { get: () => Promise.resolve({ data: current, error: null, fetchedAt: null }) },
    });
    const { rerender } = render(<CardTab tab={twoRepos} />);
    await screen.findByRole('tab', { name: 'PR description', selected: true });
    // when
    current = null;
    rerender(<CardTab tab={{ ...twoRepos, worktreePath: '/wts/halo-xena-62-config' }} />);
    // then
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'PR description' })).not.toBeInTheDocument();
    });
    await act(() => Promise.resolve());
    expect(screen.queryByRole('tab', { name: 'PR description' })).not.toBeInTheDocument();
  });

  test('the first worktree appearing keeps the open file tabs', async () => {
    // given
    fakeVault([{ path: 'Projects/Maple/Spike.md', modifiedAt: new Date().toISOString() }]);
    const { rerender } = render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    await userEvent.click(await screen.findByText('Spike.md'));
    // when
    rerender(<CardTab tab={{ ...tab, worktreePaths: [tab.worktreePath ?? ''] }} />);
    // then
    expect(screen.getByRole('tab', { name: 'Spike.md', selected: true })).toBeInTheDocument();
  });

  test('marks a file viewed in one repo only', async () => {
    // given
    fakeMaple({
      repo: {
        info: () => Promise.resolve(xena),
        changes: () =>
          Promise.resolve({
            base: 'abc',
            files: [{ path: 'README.md', status: 'M', oldPath: null, stamp: '1:1' }],
            added: 1,
            removed: 0,
          }),
      },
    });
    const { rerender } = render(<CardTab tab={twoRepos} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Viewed README.md' }));
    // when
    rerender(<CardTab tab={{ ...twoRepos, worktreePath: '/wts/halo-xena-62-config' }} />);
    // then
    expect(await screen.findByRole('checkbox', { name: 'Viewed README.md' })).not.toBeChecked();
  });

  test('switching repos clears the Approve error', async () => {
    // given
    fakeMaple({
      pr: {
        get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }),
        review: reviewOf([]),
        approve: () => Promise.reject(new Error('approving PR: offline')),
      },
    });
    const { rerender } = render(<CardTab tab={twoRepos} />);
    await clickApprove();
    await confirmApprove();
    expect(await screen.findByRole('alert')).toHaveTextContent('approving PR: offline');
    // when
    rerender(<CardTab tab={{ ...twoRepos, worktreePath: '/wts/halo-xena-62-config' }} />);
    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('keeps the active file when closing another file tab', async () => {
    // given
    fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'a.ts', 'b.ts']) } });
    render(<CardTab tab={tab} />);
    await userEvent.dblClick(await screen.findByText('README.md'));
    await userEvent.dblClick(screen.getByText('a.ts'));
    await userEvent.dblClick(screen.getByText('b.ts'));
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

  test('Close Others on a file tab keeps only that file open and active', async () => {
    // given
    fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'a.ts', 'b.ts']) } });
    render(<CardTab tab={tab} />);
    await userEvent.dblClick(await screen.findByText('README.md'));
    await userEvent.dblClick(screen.getByText('a.ts'));
    await userEvent.dblClick(screen.getByText('b.ts'));
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close Others' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['a.ts']);
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test('Close Others on the active file tab keeps it active', async () => {
    // given
    fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'a.ts', 'b.ts']) } });
    render(<CardTab tab={tab} />);
    await userEvent.dblClick(await screen.findByText('README.md'));
    await userEvent.dblClick(screen.getByText('a.ts'));
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close Others' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['a.ts']);
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test('opening quick open closes the file tab menu', async () => {
    // given
    fakeRepo(false);
    useMaple.setState({ activeTabId: 't1' });
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByText('README.md'));
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'README.md' }));
    // when
    await userEvent.keyboard('{Control>}p{/Control}');
    // then
    expect(screen.getByRole('dialog', { name: 'Quick open' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('Close All on a file tab clears the selection', async () => {
    // given
    fakeMaple({ repo: { listFiles: () => Promise.resolve(['README.md', 'a.ts', 'b.ts']) } });
    render(<CardTab tab={tab} />);
    await userEvent.dblClick(await screen.findByText('README.md'));
    await userEvent.dblClick(screen.getByText('a.ts'));
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close All' }));
    // then
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('a.ts').closest('li')?.className).not.toMatch(/selected/);
  });

  test('shows Approve & merge in the Claude pane after its actions and not in the header', async () => {
    // given
    const sendPrompt = vi.fn();
    fakeMaple({
      session: { sendPrompt },
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review: reviewOf([]) },
    });
    useMaple.setState({
      config: {
        ...FAKE_CONFIG,
        data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, actions: [{ label: 'Sync', prompt: 'Sync {key}' }] },
      },
    });
    render(<CardTab tab={tab} />);
    const slot = within(screen.getByTestId('claude-slot'));
    // when
    await userEvent.click(slot.getByRole('button', { name: 'Sync' }));
    // then
    expect(sendPrompt).toHaveBeenCalledWith('t1', 'Sync MPL-20');
    expect(await slot.findByRole('button', { name: 'Approve & merge' })).toBeEnabled();
    expect(slot.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sync', 'Approve & merge']);
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Approve & merge' })).toBeNull();
  });

  test('Approve & merge always asks before approving', async () => {
    // given
    const approve = vi.fn(() => Promise.resolve());
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review: reviewOf([]), approve },
    });
    render(<CardTab tab={tab} />);
    // when
    await clickApprove();
    // then
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Approves PR #13 and merges it.');
    expect(within(dialog).getByRole('button', { name: 'Approve & merge' })).toHaveAttribute('data-variant', 'primary');
    expect(approve).not.toHaveBeenCalled();
  });

  test('the approve dialog names the PR number', async () => {
    // given
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review: reviewOf([]) },
    });
    render(<CardTab tab={tab} />);
    // when
    await clickApprove();
    // then
    expect(screen.getByRole('heading', { name: 'Approve & merge PR #13?' })).toBeInTheDocument();
  });

  test.each([
    { name: 'confirm approves the head commit', button: 'Approve & merge', calls: [['t1', head]] },
    { name: 'Cancel approves nothing', button: 'Cancel', calls: [] },
  ])('the approve dialog: $name', async ({ button, calls }) => {
    // given
    const approve = vi.fn<(tabId: string, headSha: string) => Promise<void>>(() => Promise.resolve());
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review: reviewOf([]), approve },
    });
    render(<CardTab tab={tab} />);
    await clickApprove();
    // when
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: button }));
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approve.mock.calls).toEqual(calls);
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
      epic: null,
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
    expect(slot.getByRole('button', { name: 'Approve & merge' })).toBeInTheDocument();
  });

  test('a Done card without a worktree shows a success notice with Close tab', async () => {
    // given
    const card: Card = {
      key: 'MPL-20',
      summary: 'File Tree',
      status: 'Done',
      points: 3,
      labels: [],
      blockedBy: [],
      epic: null,
      descriptionMd: '',
      url: 'https://example.atlassian.net/browse/MPL-20',
    };
    const sprint = { id: 1, name: 'S1', startDate: '', endDate: '', cards: [card] };
    fakeMaple({ jira: { sprint: () => Promise.resolve({ data: sprint, error: null, fetchedAt: null }) } });
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    const notice = await within(screen.getByTestId('claude-slot')).findByRole('status');
    expect(notice).toHaveTextContent('Merged');
    expect(notice).toHaveAttribute('data-tone', 'success');
    expect(within(notice).getByRole('button', { name: 'Close tab' })).toBeInTheDocument();
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
      epic: null,
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
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review: reviewOf([]), approve },
    });
    render(<CardTab tab={tab} />);
    // when
    await clickApprove();
    await confirmApprove();
    // then
    expect(await within(screen.getByTestId('claude-slot')).findByRole('alert')).toHaveTextContent(
      'approving PR: offline',
    );
    // when
    await clickApprove();
    await confirmApprove();
    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a PR with new commits reloads the review by itself and enables Approve', async () => {
    // given
    const moved = 'd'.repeat(40);
    const review = vi
      .fn<() => Promise<Fetched<Review>>>()
      .mockImplementationOnce(reviewOf([]))
      .mockResolvedValue({
        data: { number: 13, headSha: moved, baseSha: 'c'.repeat(40), added: 9, removed: 4, files: [] },
        error: null,
        fetchedAt: null,
      });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: pr, error: null, fetchedAt: null })
      .mockResolvedValue({ data: { ...pr, headSha: moved }, error: null, fetchedAt: null });
    const changed = captureRepoChanged({ pr: { get, review } });
    render(<CardTab tab={tab} />);
    const banner = within(screen.getByRole('banner'));
    expect(await banner.findByText('Reviewing aaaaaaa')).toBeInTheDocument();
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await banner.findByText('Updated to ddddddd')).toBeInTheDocument();
    expect(within(screen.getByTestId('claude-slot')).getByRole('button', { name: 'Approve & merge' })).toBeEnabled();
  });

  test('keeps the Viewed check only on files the new commits did not change', async () => {
    // given
    const moved = 'd'.repeat(40);
    const file = (path: string, stamp: string) => ({ path, status: 'M' as const, oldPath: null, stamp });
    const reviewAt = (headSha: string, bStamp: string): Fetched<Review> => ({
      data: {
        number: 13,
        headSha,
        baseSha: 'c'.repeat(40),
        added: 9,
        removed: 4,
        files: [file('a.ts', 'f'.repeat(40)), file('b.ts', bStamp)],
      },
      error: null,
      fetchedAt: null,
    });
    const review = vi
      .fn<() => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(reviewAt(head, 'f'.repeat(40)))
      .mockResolvedValue(reviewAt(moved, 'e'.repeat(40)));
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: pr, error: null, fetchedAt: null })
      .mockResolvedValue({ data: { ...pr, headSha: moved }, error: null, fetchedAt: null });
    const changed = captureRepoChanged({ pr: { get, review } });
    render(<CardTab tab={tab} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Viewed a.ts' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Viewed b.ts' }));
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await within(screen.getByRole('banner')).findByText('Updated to ddddddd')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Viewed a.ts' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Viewed b.ts' })).not.toBeChecked();
  });

  test('an Approve error goes away when the review reloads at a new commit', async () => {
    // given
    const moved = 'd'.repeat(40);
    const review = vi
      .fn<() => Promise<Fetched<Review>>>()
      .mockImplementationOnce(reviewOf([]))
      .mockResolvedValue({
        data: { number: 13, headSha: moved, baseSha: 'c'.repeat(40), added: 9, removed: 4, files: [] },
        error: null,
        fetchedAt: null,
      });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: pr, error: null, fetchedAt: null })
      .mockResolvedValue({ data: { ...pr, headSha: moved }, error: null, fetchedAt: null });
    const approve = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('approving PR: offline'));
    const changed = captureRepoChanged({ pr: { get, review, approve } });
    render(<CardTab tab={tab} />);
    await clickApprove();
    await confirmApprove();
    expect(await screen.findByRole('alert')).toHaveTextContent('approving PR: offline');
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await within(screen.getByRole('banner')).findByText('Updated to ddddddd')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('an Approve error stays when a refresh finds the same head commit', async () => {
    // given
    const review = vi.fn<() => Promise<Fetched<Review>>>(reviewOf([]));
    const approve = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('approving PR: offline'));
    const changed = captureRepoChanged({
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review, approve },
    });
    render(<CardTab tab={tab} />);
    await clickApprove();
    await confirmApprove();
    expect(await screen.findByRole('alert')).toHaveTextContent('approving PR: offline');
    // when
    act(() => {
      changed.value();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // then
    expect(review).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('approving PR: offline');
  });

  test.each([
    { name: 'unviewed files', undecided: 0 },
    { name: 'undecided findings', undecided: 1 },
  ])('a review reload at a new commit closes the $name confirm without approving', async ({ undecided }) => {
    // given
    const moved = 'd'.repeat(40);
    const files = [{ path: 'src/a.ts', status: 'M' as const, oldPath: null, stamp: 'f'.repeat(40) }];
    const reviewAt = (headSha: string): Fetched<Review> => ({
      data: { number: 13, headSha, baseSha: 'c'.repeat(40), added: 9, removed: 4, files },
      error: null,
      fetchedAt: null,
    });
    const review = vi
      .fn<() => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce(reviewAt(head))
      .mockResolvedValue(reviewAt(moved));
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: pr, error: null, fetchedAt: null })
      .mockResolvedValue({ data: { ...pr, headSha: moved }, error: null, fetchedAt: null });
    const approve = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const changed = captureRepoChanged({
      pr: { get, review, approve },
      findings: { get: undecidedFindings(undecided) },
    });
    render(<CardTab tab={tab} />);
    await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' });
    await clickApprove();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // when
    act(() => {
      changed.value();
    });
    // then
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await within(screen.getByRole('banner')).findByText('Updated to ddddddd')).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
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
        review: reviewOf([]),
        approve: vi.fn<() => Promise<void>>().mockRejectedValue(reason),
      },
    });
    render(<CardTab tab={tab} />);
    // when
    await clickApprove();
    await confirmApprove();
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^approving PR: offline$/);
  });

  test('Approve & merge shows Merging… until the approve finishes', async () => {
    // given
    let settle: () => void = () => undefined;
    const approve = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    fakeMaple({
      pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review: reviewOf([]), approve },
    });
    render(<CardTab tab={tab} />);
    // when
    await clickApprove();
    await confirmApprove();
    // then
    expect(within(screen.getByTestId('claude-slot')).getByRole('button', { name: 'Merging…' })).toBeDisabled();
    // when
    await act(async () => {
      settle();
      await Promise.resolve();
    });
    // then
    expect(within(screen.getByTestId('claude-slot')).getByRole('button', { name: 'Approve & merge' })).toBeEnabled();
  });

  test('a failed merge restores Approve & merge and shows the error', async () => {
    // given
    fakeMaple({
      pr: {
        get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }),
        review: reviewOf([]),
        approve: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('approving PR: offline')),
      },
    });
    render(<CardTab tab={tab} />);
    // when
    await clickApprove();
    await confirmApprove();
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('approving PR: offline');
    expect(within(screen.getByTestId('claude-slot')).getByRole('button', { name: 'Approve & merge' })).toBeEnabled();
  });

  test('Reload review beside a blocked Approve & merge reloads the review', async () => {
    // given
    const review = vi
      .fn<() => Promise<Fetched<Review>>>()
      .mockResolvedValueOnce({ data: null, error: 'fetching review: offline', fetchedAt: null })
      .mockImplementation(reviewOf([]));
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }), review } });
    render(<CardTab tab={tab} />);
    const pane = within(screen.getByTestId('claude-slot'));
    await vi.waitFor(() => {
      expect(pane.getByRole('button', { name: 'Approve & merge' })).toHaveAccessibleDescription('Review not loaded');
    });
    // when
    await userEvent.click(pane.getByRole('button', { name: 'Reload review' }));
    // then
    await vi.waitFor(() => {
      expect(pane.getByRole('button', { name: 'Approve & merge' })).toBeEnabled();
    });
    expect(review).toHaveBeenCalledTimes(2);
  });

  function fakeApprove(
    paths: readonly string[] = ['src/a.ts'],
    approve = vi.fn<(tabId: string, headSha: string) => Promise<void>>(() => Promise.resolve()),
    undecided = 0,
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
      pr: {
        get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }),
        review: reviewOf(paths),
        approve,
      },
      findings: { get: undecidedFindings(undecided) },
    });
    return approve;
  }

  test.each([
    { name: 'one file', paths: ['src/a.ts'], text: '1 changed file not viewed.' },
    { name: 'two files', paths: ['src/a.ts', 'src/b.ts'], text: '2 changed files not viewed.' },
  ])('the approve dialog lists unviewed files: $name', async ({ paths, text }) => {
    // given
    const approve = fakeApprove(paths);
    render(<CardTab tab={tab} />);
    await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' });
    // when
    await clickApprove();
    // then
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(text);
    expect(within(dialog).getByRole('button', { name: 'Approve & merge' })).toHaveAttribute('data-variant', 'danger');
    expect(approve).not.toHaveBeenCalled();
  });

  test('the approve dialog lists undecided findings', async () => {
    // given
    fakeApprove([], undefined, 1);
    render(<CardTab tab={tab} />);
    await screen.findByText('Reviewing aaaaaaa');
    // when
    await clickApprove();
    // then
    const dialog = screen.getByRole('dialog');
    await vi.waitFor(() => {
      expect(dialog).toHaveTextContent('1 finding not decided.');
    });
    expect(within(dialog).getByRole('button', { name: 'Approve & merge' })).toHaveAttribute('data-variant', 'danger');
  });

  test('one dialog lists both findings and unviewed files, and confirming approves', async () => {
    // given
    const approve = fakeApprove(['src/a.ts'], undefined, 1);
    render(<CardTab tab={tab} />);
    await screen.findByRole('checkbox', { name: 'Viewed src/a.ts' });
    await clickApprove();
    expect(screen.getByRole('dialog')).toHaveTextContent('1 finding not decided. 1 changed file not viewed.');
    // when
    await confirmApprove();
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approve).toHaveBeenCalledWith('t1', head);
  });

  test('decided findings add no warning to the approve dialog', async () => {
    // given
    fakeApprove([], undefined);
    const decision = { kind: 'fix-later' as const, reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };
    const file = findingsFile([finding({ decision })]);
    window.maple.findings.get = vi.fn(() => Promise.resolve({ data: file, error: null, fetchedAt: null }));
    render(<CardTab tab={tab} />);
    await screen.findByText('Reviewing aaaaaaa');
    // when
    await clickApprove();
    // then
    expect(screen.getByRole('dialog')).toHaveTextContent('Approves PR #13 and merges it.');
  });

  test('shows no Close button in the Claude pane', async () => {
    // given
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }) } });
    // when
    render(<CardTab tab={tab} />);
    // then
    const slot = within(screen.getByTestId('claude-slot'));
    await slot.findByRole('button', { name: 'Approve & merge' });
    expect(slot.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  test('with a review, the tree lists the review files instead of the worktree changes', async () => {
    // given
    fakeApprove(['src/a.ts']);
    window.maple.pr.review = reviewOf(['src/b.ts']);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('checkbox', { name: 'Viewed src/b.ts' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Viewed src/a.ts' })).not.toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.getByText('+9')).toBeInTheDocument();
    expect(screen.getByText('−4')).toBeInTheDocument();
  });

  test('shows the reviewed commit in the header', async () => {
    // given
    fakeApprove([], undefined);
    // when
    render(<CardTab tab={tab} />);
    // then
    const banner = within(screen.getByRole('banner'));
    expect(await banner.findByText('Reviewing aaaaaaa')).toBeInTheDocument();
  });

  test('an open PR without a loaded review disables Approve', async () => {
    // given
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }) } });
    // when
    render(<CardTab tab={tab} />);
    // then
    const approve = await within(screen.getByTestId('claude-slot')).findByRole('button', { name: 'Approve & merge' });
    await vi.waitFor(() => {
      expect(approve).toHaveAccessibleDescription('Review not loaded');
    });
  });

  test('a working tab disables Approve', async () => {
    // given
    fakeMaple({ pr: { get: () => Promise.resolve({ data: pr, error: null, fetchedAt: null }) } });
    useMaple.setState({
      statuses: {
        t1: { tabId: 't1', dot: 'working', sessionAlive: true, exitCode: null, resumeFailed: false, sync: null },
      },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    const approve = await within(screen.getByTestId('claude-slot')).findByRole('button', { name: 'Approve & merge' });
    await vi.waitFor(() => {
      expect(approve).toHaveAccessibleDescription('Agent is working');
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

  test.each([
    { info: null, want: false },
    { info: { name: 'maple', branch: 'mpl-1-x', hasTry: false }, want: false },
    { info: { name: 'maple', branch: 'mpl-1-x', hasTry: true }, want: true },
  ])('shows the make try button $want when repo info is $info', async ({ info, want }) => {
    // given
    const repoInfo = vi.fn(() => Promise.resolve(info));
    fakeMaple({ repo: { info: repoInfo } });
    // when
    render(<CardTab tab={tab} />);
    // then
    await vi.waitFor(() => {
      expect(repoInfo).toHaveBeenCalled();
    });
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button', { name: 'Run make try' }) !== null).toBe(want);
    expect(screen.queryByTestId('terminal-pane')).not.toBeInTheDocument();
  });

  test('make try shows a hidden terminal panel and asks the pane for one more run each click', async () => {
    // given
    fakeMaple({ repo: { info: () => Promise.resolve({ name: 'maple', branch: 'mpl-1-x', hasTry: true }) } });
    render(<CardTab tab={tab} />);
    const terminal = screen.getByRole('button', { name: 'Terminal' });
    await userEvent.click(terminal);
    await userEvent.click(terminal);
    const runTry = await screen.findByRole('button', { name: 'Run make try' });
    // when
    await userEvent.click(runTry);
    // then
    expect(screen.getByTestId('terminal-pane')).toBeVisible();
    expect(terminal).toHaveAttribute('aria-pressed', 'true');
    expect(vi.mocked(TerminalPane).mock.lastCall?.[0]).toMatchObject({ tryRuns: 1, worktreePath: tab.worktreePath });
    // when
    await userEvent.click(runTry);
    // then
    expect(vi.mocked(TerminalPane).mock.lastCall?.[0]).toMatchObject({ tryRuns: 2 });
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
    render(<CardTab tab={tab} />);
    await screen.findByText('README.md');
    act(() => {
      useMaple.setState({ activeTabId: 'other' });
    });
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

  test('notes the card names are marked changed with the notes the session wrote', async () => {
    // given
    const now = new Date().toISOString();
    fakeVault(
      [
        { path: 'Claude.md', modifiedAt: now },
        { path: 'Projects/Maple/Spike.md', modifiedAt: now },
        { path: 'Taylor.md', modifiedAt: now },
      ],
      ['Claude.md'],
      [
        card('MPL-20', 'In Progress', {
          descriptionMd: 'Output: `Projects/Maple/Spike.md` and `Projects/Maple/Missing.md`',
        }),
      ],
    );
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    const tree = within(screen.getByTestId('tree-slot'));
    expect(await tree.findByRole('button', { name: 'Changed (2)' })).toBeInTheDocument();
    expect(tree.getByText('Claude.md').parentElement).toHaveTextContent('M');
    expect(tree.getByText('Spike.md').parentElement).toHaveTextContent('M');
    expect(tree.queryByText('Taylor.md')).not.toBeInTheDocument();
    expect(tree.queryByText('Missing.md')).not.toBeInTheDocument();
  });

  test('a note the session wrote and the card names is counted once', async () => {
    // given
    fakeVault(
      [{ path: 'Spike.md', modifiedAt: new Date().toISOString() }],
      ['Spike.md'],
      [card('MPL-20', 'In Progress', { descriptionMd: 'Output: `Spike.md`' })],
    );
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    const tree = within(screen.getByTestId('tree-slot'));
    expect(await tree.findByRole('button', { name: 'Changed (1)' })).toBeInTheDocument();
    expect(tree.getAllByText('Spike.md')).toHaveLength(1);
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

  test('the Terminal button shows its shortcut', () => {
    // given
    fakeMaple();
    // when
    render(<CardTab tab={tab} />);
    // then
    const button = screen.getByRole('button', { name: 'Terminal' });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+`');
    expect(button).toHaveTextContent('Ctrl+`');
  });

  test.each([
    { dot: 'ready' as const, count: 2, label: '2 findings need you' },
    { dot: 'working' as const, count: 2, label: 'Findings (2)' },
    { dot: 'ready' as const, count: 0, label: null },
  ])('the findings button with a $dot dot and $count findings reads $label', async ({ dot, count, label }) => {
    // given
    const file = findingsFile(Array.from({ length: count }, (_, i) => finding({ id: `F${String(i + 1)}` })));
    const get = vi.fn(() => Promise.resolve({ data: file, error: null, fetchedAt: null }));
    fakeMaple({ findings: { get } });
    useMaple.setState({
      statuses: { t1: { tabId: 't1', dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null } },
    });
    // when
    render(<CardTab tab={tab} />);
    // then
    const banner = within(screen.getByRole('banner'));
    if (label === null) {
      await waitFor(() => {
        expect(get).toHaveBeenCalledWith('t1');
      });
      expect(banner.queryByRole('button', { name: /findings/i })).not.toBeInTheDocument();
    } else {
      expect(await banner.findByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  test('a findings file that cannot be read still shows a button that opens its error', async () => {
    // given
    const error = 'reading findings: MPL-20.json is from a newer Maple';
    fakeMaple({ findings: { get: vi.fn(() => Promise.resolve({ data: null, error, fetchedAt: null })) } });
    render(<CardTab tab={tab} />);
    // when
    await userEvent.click(
      await within(screen.getByRole('banner')).findByRole('button', { name: "Findings can't be read" }),
    );
    // then
    expect(screen.getByRole('tab', { name: 'Findings', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(error);
  });

  test('the findings button opens the Findings tab', async () => {
    // given
    const file = findingsFile([finding({ title: 'Branch name reaches a shell' })]);
    fakeMaple({ findings: { get: vi.fn(() => Promise.resolve({ data: file, error: null, fetchedAt: null })) } });
    render(<CardTab tab={tab} />);
    // when
    await userEvent.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Findings (1)' }));
    // then
    expect(screen.getByRole('tab', { name: 'Findings', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Branch name reaches a shell' })).toBeInTheDocument();
  });
});
