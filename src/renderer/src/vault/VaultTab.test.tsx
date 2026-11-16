import type { MapleApi } from '@shared/api/mapleApi';
import type { TabState } from '@shared/types/tabs/tabState';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { FAKE_CONFIG, fakeMaple } from '@renderer/testing/fakeMaple';
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

function fakeVault(vault: Partial<MapleApi['vault']> = {}) {
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
      ...vault,
    },
  });
  return { read, before, written, list, changed };
}

describe('VaultTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useMaple.setState(useMaple.getInitialState(), true);
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

  test('heads the tree with the vault folder name and its full path on hover', () => {
    // given
    useMaple.setState({
      config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/home/bear/notes/' } },
    });
    fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(screen.getByRole('heading', { name: 'notes' })).toHaveAttribute('title', '/home/bear/notes/');
  });

  test('shows no vault name heading when no vault folder is set', () => {
    // given
    fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
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

  test('uses saved split sizes', () => {
    // given
    fakeVault();
    localStorage.setItem('maple.split.vaultTree', '300');
    localStorage.setItem('maple.split.vaultClaude', '40');
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(screen.getByTestId('claude-slot')).toHaveStyle({ width: '40%' });
    expect(screen.getByTestId('tree-slot')).toHaveStyle({ width: '300px' });
  });

  test('shows a resize handle on each side of the viewer', () => {
    // given
    fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(screen.getAllByRole('separator').map((s) => s.getAttribute('aria-label'))).toEqual([
      'Resize file tree',
      'Resize Claude pane',
    ]);
  });

  test('+ Note puts a name box in the selected folder, and Enter creates the note and opens it in Edit mode', async () => {
    // given
    const createNote = vi.fn(() => Promise.resolve());
    const { list } = fakeVault({ createNote });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    list.mockResolvedValue([{ path: 'Projects/Plan.md', modifiedAt: '2026-10-23T12:00:00.000Z' }]);
    // when
    await userEvent.keyboard('Plan{Enter}');
    // then
    expect(createNote).toHaveBeenCalledWith('Projects/Plan.md');
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Plan.md' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('textbox', { name: 'New note name' })).not.toBeInTheDocument();
  });

  test('Escape removes the name box without creating anything', async () => {
    // given
    const createNote = vi.fn(() => Promise.resolve());
    fakeVault({ createNote });
    render(<VaultTab tab={vaultTab} />);
    await screen.findByText('Inbox.md');
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    // when
    await userEvent.keyboard('Plan{Escape}');
    // then
    expect(screen.queryByRole('textbox', { name: 'New note name' })).not.toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
  });

  test('+ Folder creates the folder and keeps it in the tree while it is empty', async () => {
    // given
    const createFolder = vi.fn(() => Promise.resolve());
    fakeVault({ createFolder });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByRole('button', { name: '+ Folder' }));
    // when
    await userEvent.keyboard('Ideas{Enter}');
    // then
    expect(createFolder).toHaveBeenCalledWith('Projects/Ideas');
    expect(await screen.findByText('Ideas')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'New folder name' })).not.toBeInTheDocument();
  });

  test('Move to trash trashes the note, closes its tab, and drops it from the tree', async () => {
    // given
    const { list } = fakeVault();
    const trash = vi.fn(() => {
      list.mockResolvedValue([{ path: 'Projects/Maple/Spike.md', modifiedAt: '2026-10-23T12:00:00.000Z' }]);
      return Promise.resolve();
    });
    fakeVault({ trash, list });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Inbox.md'));
    expect(screen.getByRole('tab', { name: 'Inbox.md' })).toBeInTheDocument();
    // when
    fireEvent.contextMenu(screen.getByText('Inbox.md', { selector: 'li span' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }));
    // then
    expect(trash).toHaveBeenCalledWith('Inbox.md');
    await waitFor(() => {
      expect(screen.queryByText('Inbox.md')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'Inbox.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('shows why moving a note to the trash failed', async () => {
    // given
    const trash = vi.fn(() => Promise.reject(new Error('trashing note: path is outside the vault')));
    fakeVault({ trash });
    render(<VaultTab tab={vaultTab} />);
    // when
    fireEvent.contextMenu(await screen.findByText('Inbox.md'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('trashing note: path is outside the vault');
    expect(screen.getByText('Inbox.md')).toBeInTheDocument();
  });

  test('a later trash clears the notice from an earlier failure', async () => {
    // given
    const createNote = vi.fn(() => Promise.reject(new Error('creating note: a note with that name already exists')));
    fakeVault({ createNote });
    render(<VaultTab tab={vaultTab} />);
    await screen.findByText('Inbox.md');
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    await userEvent.keyboard('Inbox{Enter}');
    await screen.findByRole('alert');
    // when
    fireEvent.contextMenu(screen.getByText('Inbox.md'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }));
    // then
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  test('Move to trash is disabled while the note has unsaved edits', async () => {
    // given
    fakeVault();
    useMaple.getState().setDraft('v1', 'vault:Inbox.md', { text: '# Edited', disk: '# Inbox' });
    render(<VaultTab tab={vaultTab} />);
    // when
    fireEvent.contextMenu(await screen.findByText('Inbox.md'));
    // then
    const item = screen.getByRole('menuitem', { name: /Move to trash/ });
    expect(item).toBeDisabled();
    expect(within(item).getByText('Save or discard your edits first')).toBeInTheDocument();
  });

  test.each([
    { name: 'adds .md to a name without it', typed: 'Plan', made: 'Projects/Maple/Plan.md' },
    { name: 'keeps a name that already ends in .md', typed: 'Plan.md', made: 'Projects/Maple/Plan.md' },
  ])('+ Note after clicking a note creates in its folder and $name', async ({ typed, made }) => {
    // given
    const createNote = vi.fn(() => Promise.resolve());
    fakeVault({ createNote });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByText('Maple'));
    await userEvent.click(screen.getByText('Spike.md', { selector: 'li span' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    // when
    await userEvent.keyboard(`${typed}{Enter}`);
    // then
    expect(createNote).toHaveBeenCalledWith(made);
  });

  test('shows why creating a note failed', async () => {
    // given
    const createNote = vi.fn(() => Promise.reject(new Error('creating note: a note with that name already exists')));
    fakeVault({ createNote });
    render(<VaultTab tab={vaultTab} />);
    await screen.findByText('Inbox.md');
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    // when
    await userEvent.keyboard('Inbox{Enter}');
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('creating note: a note with that name already exists');
    expect(createNote).toHaveBeenCalledWith('Inbox.md');
  });

  test('says new items go in the vault root until a folder is clicked', async () => {
    // given
    fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(await screen.findByText('New items go in the vault root')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use vault root' })).not.toBeInTheDocument();
  });

  test('clicking a folder highlights it and names it as where new items go', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    // when
    await userEvent.click(await screen.findByText('Projects'));
    // then
    expect(screen.getByText('New items go in Projects')).toBeInTheDocument();
    expect(screen.getByText('Projects').parentElement).toHaveAttribute('aria-current', 'location');
  });

  test('clicking a note makes its folder the target', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    await userEvent.click(screen.getByText('Maple'));
    // when
    await userEvent.click(screen.getByText('Spike.md', { selector: 'li span' }));
    // then
    expect(screen.getByText('New items go in Projects/Maple')).toBeInTheDocument();
    expect(screen.getByText('Maple').parentElement).toHaveAttribute('aria-current', 'location');
  });

  test('Use vault root moves the target back to the vault root', async () => {
    // given
    const createNote = vi.fn(() => Promise.resolve());
    fakeVault({ createNote });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Use vault root' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    await userEvent.keyboard('Plan{Enter}');
    // then
    expect(screen.getByText('Projects').parentElement).not.toHaveAttribute('aria-current');
    expect(createNote).toHaveBeenCalledWith('Plan.md');
  });

  test.each([
    { button: '+ Note', placeholder: 'Note name in Projects' },
    { button: '+ Folder', placeholder: 'Folder name in Projects' },
  ])('$button names the target folder in the name box', async ({ button, placeholder }) => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Projects'));
    // when
    await userEvent.click(screen.getByRole('button', { name: button }));
    // then
    expect(screen.getByPlaceholderText(placeholder)).toHaveFocus();
  });

  test('Rename renames the note and keeps its tab open under the new name', async () => {
    // given
    const { list } = fakeVault();
    const rename = vi.fn(() => {
      list.mockResolvedValue([{ path: 'Ideas.md', modifiedAt: '2026-10-23T12:00:00.000Z' }]);
      return Promise.resolve();
    });
    fakeVault({ rename, list });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Inbox.md'));
    // when
    fireEvent.contextMenu(screen.getByText('Inbox.md', { selector: 'li span' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'New name for Inbox.md' });
    expect(box).toHaveValue('Inbox');
    await userEvent.clear(box);
    await userEvent.keyboard('Ideas{Enter}');
    // then
    expect(rename).toHaveBeenCalledWith('Inbox.md', 'Ideas.md');
    expect(await screen.findByRole('tab', { name: 'Ideas.md' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Inbox.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'New name for Inbox.md' })).not.toBeInTheDocument();
  });

  test('shows why renaming a note failed and keeps the rename box', async () => {
    // given
    const rename = vi.fn(() => Promise.reject(new Error('renaming note: a note with that name already exists')));
    fakeVault({ rename });
    render(<VaultTab tab={vaultTab} />);
    fireEvent.contextMenu(await screen.findByText('Inbox.md'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'New name for Inbox.md' }));
    // when
    await userEvent.keyboard('Taken{Enter}');
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('renaming note: a note with that name already exists');
    expect(screen.getByRole('textbox', { name: 'New name for Inbox.md' })).toBeInTheDocument();
  });

  test('F2 on the tree starts renaming the active note', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Inbox.md'));
    // when
    fireEvent.keyDown(screen.getByTestId('tree-slot'), { key: 'F2' });
    // then
    expect(screen.getByRole('textbox', { name: 'New name for Inbox.md' })).toHaveValue('Inbox');
  });

  test('Delete on the tree moves the active note to the trash', async () => {
    // given
    const trash = vi.fn(() => Promise.resolve());
    fakeVault({ trash });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Inbox.md'));
    // when
    fireEvent.keyDown(screen.getByTestId('tree-slot'), { key: 'Delete' });
    // then
    expect(trash).toHaveBeenCalledWith('Inbox.md');
  });

  test('Delete in a name box does not trash the active note', async () => {
    // given
    const trash = vi.fn(() => Promise.resolve());
    fakeVault({ trash });
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Inbox.md'));
    await userEvent.click(screen.getByRole('button', { name: '+ Note' }));
    // when
    await userEvent.keyboard('Plan{Delete}');
    // then
    expect(trash).not.toHaveBeenCalled();
  });

  test('Duplicate opens the copy', async () => {
    // given
    const duplicate = vi.fn(() => Promise.resolve('Inbox 1.md'));
    fakeVault({ duplicate });
    render(<VaultTab tab={vaultTab} />);
    // when
    fireEvent.contextMenu(await screen.findByText('Inbox.md'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    // then
    expect(duplicate).toHaveBeenCalledWith('Inbox.md');
    expect(await screen.findByRole('tab', { name: 'Inbox 1.md' })).toBeInTheDocument();
  });

  test('Copy path puts the vault path on the clipboard', async () => {
    // given
    fakeVault();
    const user = userEvent.setup();
    render(<VaultTab tab={vaultTab} />);
    await user.click(await screen.findByText('Projects'));
    await user.click(screen.getByText('Maple'));
    // when
    fireEvent.contextMenu(screen.getByText('Spike.md'));
    await user.click(screen.getByRole('menuitem', { name: 'Copy path' }));
    // then
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe('Projects/Maple/Spike.md');
    });
  });

  test('Open in Obsidian asks main to open the note', async () => {
    // given
    const openInObsidian = vi.fn(() => Promise.resolve());
    fakeVault({ openInObsidian });
    render(<VaultTab tab={vaultTab} />);
    // when
    fireEvent.contextMenu(await screen.findByText('Inbox.md'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open in Obsidian' }));
    // then
    expect(openInObsidian).toHaveBeenCalledWith('Inbox.md');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
