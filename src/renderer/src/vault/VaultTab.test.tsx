import type { TabState } from '@shared/types/tabs/tabState';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { VaultTab } from './VaultTab';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));

vi.mock('../claude/ClaudePane', () => ({
  ClaudePane: ({ tabId }: { tabId: string }) => <div data-testid="claude-pane">{tabId}</div>,
}));

vi.mock('@monaco-editor/react', () => ({
  useMonaco: () => null,
  Editor: () => <div data-testid="editor" />,
  DiffEditor: () => <div data-testid="diff-editor" />,
}));

const vaultTab: TabState = {
  id: 'v1',
  projectKey: 'BEAR',
  kind: 'vault',
  cardKey: null,
  sessionId: 's-v1',
  worktreePath: null,
  worktreePaths: [],
};

function fakeVault() {
  const now = new Date().toISOString();
  const changed: { value: () => void } = { value: () => undefined };
  const read = vi.fn(() => Promise.resolve('## Findings'));
  const before = vi.fn(() => Promise.resolve('## Draft\n'));
  const written = vi.fn(() => Promise.resolve(['Inbox.md']));
  const list = vi.fn(() =>
    Promise.resolve([
      { path: 'Inbox.md', modifiedAt: now },
      { path: 'Projects/Maple/Spike.md', modifiedAt: now },
    ]),
  );
  fakeMaple({
    vault: {
      list,
      written,
      read,
      before,
      onChanged: (cb) => {
        changed.value = cb;
        return vi.fn();
      },
    },
  });
  return { read, before, written, list, changed };
}

describe('VaultTab', () => {
  beforeEach(() => {
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

  test('shows the top level of the vault with folders closed', async () => {
    // given
    fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(await screen.findByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Projects').parentElement).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Inbox.md')).toBeInTheDocument();
    expect(screen.queryByText('Spike.md')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All files' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Changed/ })).not.toBeInTheDocument();
  });

  test('opens a note with no Changes button, ready to edit', async () => {
    // given
    const { before } = fakeVault();
    render(<VaultTab tab={vaultTab} />);
    // when
    await userEvent.click(await screen.findByText('Inbox.md'));
    // then
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changes' })).not.toBeInTheDocument();
    expect(before).not.toHaveBeenCalled();
  });

  test('clicking a note opens it as Markdown', async () => {
    // given
    const { read } = fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByText('Maple'));
    // when
    await userEvent.click(screen.getByText('Spike.md'));
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('Projects/Maple/Spike.md');
  });

  test('the tree updates when the vault changes', async () => {
    // given
    const { list, changed } = fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await screen.findByText('Inbox.md');
    list.mockResolvedValue([
      { path: 'Inbox.md', modifiedAt: '2026-10-23T12:00:00.000Z' },
      { path: 'New.md', modifiedAt: '2026-10-23T12:00:00.000Z' },
    ]);
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await screen.findByText('New.md')).toBeInTheDocument();
  });

  test('closing the active note shows the last open note', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByText('Maple'));
    await userEvent.click(screen.getByText('Spike.md'));
    await userEvent.click(screen.getByText('Inbox.md'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close vault:Inbox.md' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Spike.md']);
    expect(screen.getByRole('tab', { name: 'Spike.md' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Close Others on a note tab keeps only that note open and active', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByText('Maple'));
    await userEvent.click(screen.getByText('Spike.md'));
    await userEvent.click(screen.getByText('Inbox.md'));
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Spike.md' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close Others' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Spike.md']);
    expect(screen.getByRole('tab', { name: 'Spike.md' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Close All on a note tab empties the viewer', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Inbox.md'));
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Inbox.md' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close All' }));
    // then
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  test('shows the Claude pane for the tab', () => {
    // given
    fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(within(screen.getByTestId('claude-slot')).getByTestId('claude-pane')).toHaveTextContent('v1');
  });
});
