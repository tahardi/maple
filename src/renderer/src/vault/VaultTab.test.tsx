import type { TabState } from '@shared/types/tabs';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { VaultTab } from './VaultTab';

vi.mock('@renderer/card/viewer/monacoSetup', () => ({}));

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
};

function fakeVault() {
  const now = new Date().toISOString();
  const changed: { value: () => void } = { value: () => undefined };
  const read = vi.fn(() => Promise.resolve('## Findings'));
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
      onChanged: (cb) => {
        changed.value = cb;
        return vi.fn();
      },
    },
  });
  return { read, written, list, changed };
}

describe('VaultTab', () => {
  test('shows every vault note in the tree', async () => {
    // given
    const { written } = fakeVault();
    // when
    render(<VaultTab tab={vaultTab} />);
    // then
    expect(await screen.findByText('Spike.md')).toBeInTheDocument();
    expect(screen.getByText('Inbox.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All files', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changed (1)', pressed: false })).toBeInTheDocument();
    expect(written).toHaveBeenCalledWith('v1');
  });

  test('the Changed toggle shows only the notes this session wrote', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await screen.findByText('Spike.md');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Changed (1)' }));
    // then
    expect(screen.getByText('Inbox.md')).toBeInTheDocument();
    expect(screen.queryByText('Spike.md')).not.toBeInTheDocument();
  });

  test('clicking a note opens it as Markdown', async () => {
    // given
    const { read } = fakeVault();
    render(<VaultTab tab={vaultTab} />);
    // when
    await userEvent.click(await screen.findByText('Spike.md'));
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('Projects/Maple/Spike.md');
  });

  test('the tree updates when the vault changes', async () => {
    // given
    const { list, written, changed } = fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Changed (1)' }));
    list.mockResolvedValue([
      { path: 'Inbox.md', modifiedAt: '2026-10-23T12:00:00.000Z' },
      { path: 'New.md', modifiedAt: '2026-10-23T12:00:00.000Z' },
    ]);
    written.mockResolvedValue(['Inbox.md', 'New.md']);
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await screen.findByText('New.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changed (2)' })).toBeInTheDocument();
  });

  test('closing the active note shows the last open note', async () => {
    // given
    fakeVault();
    render(<VaultTab tab={vaultTab} />);
    await userEvent.click(await screen.findByText('Spike.md'));
    await userEvent.click(screen.getByText('Inbox.md'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close vault:Inbox.md' }));
    // then
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Spike.md']);
    expect(screen.getByRole('tab', { name: 'Spike.md' })).toHaveAttribute('aria-selected', 'true');
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
