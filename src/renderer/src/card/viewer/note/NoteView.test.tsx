import type { MapleApi } from '@shared/api/mapleApi';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { monaco } from '@renderer/testing/fakeMonaco';
import { NoteView } from './NoteView';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));

vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

let slot: HTMLDivElement;

function renderNote(vault: Partial<MapleApi['vault']> = {}, onPin = vi.fn()) {
  const maple = fakeMaple({ vault: { read: vi.fn(() => Promise.resolve('## Findings\n')), ...vault } });
  render(<NoteView tabId="t1" path="vault:Spike.md" noteChanges onPin={onPin} toolbar={slot} />);
  return maple;
}

async function editNote() {
  await screen.findByRole('heading', { name: 'Findings' });
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  return screen.findByTestId('editor');
}

function draftPaths(): string[] {
  const { drafts } = useMaple.getState();
  return Object.hasOwn(drafts, 't1') ? Object.keys(drafts.t1) : [];
}

describe('NoteView', () => {
  beforeEach(() => {
    localStorage.clear();
    monaco.enabled.value = false;
    monaco.slowMount.value = false;
    vi.clearAllMocks();
    vi.restoreAllMocks();
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ activeTabId: 't1' });
    slot = document.createElement('div');
    document.body.appendChild(slot);
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver() {
        return { observe: vi.fn(), disconnect: vi.fn() };
      }),
    );
  });

  afterEach(() => {
    slot.remove();
    vi.unstubAllGlobals();
  });

  test('shows an overview strip beside a formatted vault note', async () => {
    // given
    renderNote();
    // when
    await screen.findByRole('heading', { name: 'Findings' });
    // then
    expect(screen.getByTestId('note-overview')).toBeInTheDocument();
  });

  test('shows no overview strip while editing a note', async () => {
    // given
    renderNote();
    // when
    await editNote();
    // then
    expect(screen.queryByTestId('note-overview')).not.toBeInTheDocument();
  });

  test('brings the overview strip back after editing', async () => {
    // given
    renderNote();
    await editNote();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Edit', pressed: true }));
    // then
    expect(await screen.findByTestId('note-overview')).toBeInTheDocument();
  });

  test('shows no overview strip while a note loads', async () => {
    // given
    const read = vi.fn(() => new Promise<string>(() => undefined));
    // when
    renderNote({ read });
    await act(() => Promise.resolve());
    // then
    expect(read).toHaveBeenCalled();
    expect(screen.queryByTestId('note-overview')).not.toBeInTheDocument();
  });

  test('keeps the overview strip when another note opens', async () => {
    // given
    fakeMaple({ vault: { read: vi.fn((path: string) => Promise.resolve(`## ${path}\n`)) } });
    const props = {
      tabId: 't1',
      noteChanges: false,
    };
    const { rerender } = render(<NoteView {...props} path="vault:One.md" toolbar={slot} />);
    await screen.findByRole('heading', { name: 'One.md' });
    // when
    rerender(<NoteView {...props} path="vault:Two.md" toolbar={slot} />);
    await screen.findByRole('heading', { name: 'Two.md' });
    // then
    expect(screen.getByTestId('note-overview')).toHaveTextContent('Two.md');
  });

  test('renders a vault note as Markdown', async () => {
    // given
    const readFile = vi.fn();
    const read = vi.fn(() => Promise.resolve('## Findings'));
    fakeMaple({ repo: { readFile }, vault: { read } });
    // when
    render(<NoteView tabId="t1" path="vault:Projects/Maple/Spike.md" noteChanges={false} toolbar={slot} />);
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('Projects/Maple/Spike.md');
    expect(readFile).not.toHaveBeenCalled();
  });

  test('re-reads a vault note each time its tab becomes active', async () => {
    // given
    const read = vi.fn(() => Promise.resolve('## First'));
    fakeMaple({ vault: { read } });
    const { unmount } = render(<NoteView tabId="t1" path="vault:Spike.md" noteChanges={false} toolbar={slot} />);
    await screen.findByRole('heading', { name: 'First' });
    unmount();
    read.mockResolvedValue('## Second');
    // when
    render(<NoteView tabId="t1" path="vault:Spike.md" noteChanges={false} toolbar={slot} />);
    // then
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('re-reads the open vault note when the vault changes', async () => {
    // given
    const changed: { value: () => void } = { value: () => undefined };
    const read = vi.fn(() => Promise.resolve('## First'));
    fakeMaple({
      vault: {
        read,
        onChanged: (cb) => {
          changed.value = cb;
          return vi.fn();
        },
      },
    });
    render(<NoteView tabId="t1" path="vault:Spike.md" noteChanges={false} toolbar={slot} />);
    await screen.findByRole('heading', { name: 'First' });
    read.mockResolvedValue('## Second');
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    expect(read).toHaveBeenLastCalledWith('Spike.md');
  });

  test('listens for vault changes only while a vault note is active', async () => {
    // given
    const stop = vi.fn();
    const onChanged = vi.fn(() => stop);
    fakeMaple({ vault: { read: () => Promise.resolve('## First'), onChanged } });
    const { unmount } = render(<NoteView tabId="t1" path="vault:Spike.md" noteChanges={false} toolbar={slot} />);
    await screen.findByRole('heading', { name: 'First' });
    // when
    unmount();
    // then
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('Edit toggles between the editor and the formatted note', async () => {
    // given
    renderNote();
    await screen.findByRole('heading', { name: 'Findings' });
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Edit', pressed: false }));
    const editor = await screen.findByTestId('editor');
    // then
    expect(editor).toHaveAttribute('data-value', '## Findings\n');
    expect(editor).toHaveAttribute('data-language', 'markdown');
    expect(editor).toHaveAttribute('data-readonly', 'false');
    expect(screen.queryByRole('heading', { name: 'Findings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Edit', pressed: true }));
    // then
    expect(screen.getByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });

  test('a note with a saved copy opens in Changes, read-only with its changed lines marked', async () => {
    // given
    monaco.enabled.value = true;
    // when
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    // then
    expect(screen.queryByRole('heading', { name: 'Findings' })).not.toBeInTheDocument();
    const editor = await screen.findByTestId('editor');
    expect(editor).toHaveAttribute('data-value', '## Findings\n');
    expect(editor).toHaveAttribute('data-language', 'markdown');
    expect(editor).toHaveAttribute('data-readonly', 'true');
    await vi.waitFor(() => {
      expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([
        expect.objectContaining({
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          options: expect.objectContaining({
            className: 'line-chg',
            hoverMessage: { value: 'Was:\n```\n## Draft\n```' },
          }) as unknown,
        }),
      ]);
    });
    expect(screen.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-pressed', 'true');
    const group = within(screen.getByRole('group', { name: 'Diff layout' }));
    expect(group.getByRole('button', { name: 'In file' })).toBeInTheDocument();
    expect(group.getByRole('button', { name: 'Side by side' })).toBeInTheDocument();
  });

  test('pressing Changes shows the formatted note', async () => {
    // given
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Changes' }));
    // then
    expect(screen.getByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
  });

  test('Edit keeps priority over Changes', async () => {
    // given
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // then
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-readonly', 'false');
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
  });

  test('a saved side-by-side mode opens Changes in the diff editor', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    // when
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    // then
    expect(await screen.findByTestId('diff-editor')).toHaveAttribute('data-original', '## Draft\n');
  });

  test('a note does not use the saved copy of another', async () => {
    // given
    const before = vi.fn((_tabId: string, path: string) => Promise.resolve(path === 'Spike.md' ? '## Draft\n' : null));
    fakeMaple({ vault: { read: vi.fn(() => Promise.resolve('## Findings\n')), before } });
    const props = {
      tabId: 't1',
      noteChanges: true,
    };
    const { rerender } = render(<NoteView {...props} path="vault:Spike.md" toolbar={slot} />);
    await screen.findByTestId('editor');
    // when
    rerender(<NoteView {...props} path="vault:Other.md" toolbar={slot} />);
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Changes' })).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
  });

  test('updates the marks when the note changes on disk while Changes is on', async () => {
    // given
    monaco.enabled.value = true;
    const read = vi.fn(() => Promise.resolve('## Draft\n'));
    let vaultChanged: () => void = () => undefined;
    const onChanged = vi.fn((cb: () => void) => {
      vaultChanged = cb;
      return () => undefined;
    });
    renderNote({ read, onChanged, before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId('editor');
    read.mockResolvedValue('## Draft\nMore\n');
    // when
    act(() => {
      vaultChanged();
    });
    // then
    await vi.waitFor(() => {
      expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([
        expect.objectContaining({
          range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
          options: expect.objectContaining({ className: 'line-add' }) as unknown,
        }),
      ]);
    });
  });

  test('Side by side shows the note before the session next to its current text', async () => {
    // given
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    // then
    const diff = await screen.findByTestId('diff-editor');
    expect(diff).toHaveAttribute('data-original', '## Draft\n');
    expect(diff).toHaveAttribute('data-modified', '## Findings\n');
    expect(localStorage.getItem('maple.viewMode')).toBe('side-by-side');
  });

  test('a note the session created marks every line as added', async () => {
    // given
    monaco.enabled.value = true;
    // when
    renderNote({ before: vi.fn(() => Promise.resolve('')) });
    // then
    await vi.waitFor(() => {
      expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([
        expect.objectContaining({
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          options: expect.objectContaining({ className: 'line-add' }) as unknown,
        }),
      ]);
    });
  });

  test('shows the note and says why Changes is off when its saved copy cannot be read', async () => {
    // given
    const message = 'reading snapshot: note is too large to compare (over 2 MB)';
    const before = vi.fn(() =>
      Promise.reject(new Error(`Error invoking remote method 'vault:before': Error: ${message}`)),
    );
    // when
    renderNote({ before });
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Changes' });
    expect(button).toBeDisabled();
    expect(screen.getByText(message)).toBeVisible();
    expect(button).toHaveAccessibleDescription(message);
  });

  test('says why a note cannot be shown', async () => {
    // given
    const read = vi.fn(() =>
      Promise.reject(new Error("Error invoking remote method 'vault:read': Error: reading note: file is too large")),
    );
    // when
    renderNote({ read });
    // then
    expect(await screen.findByText(/reading note: file is too large/)).toBeInTheDocument();
  });

  test('Edit turns Changes off, so leaving Edit shows the formatted note', async () => {
    // given
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId('editor');
    await userEvent.click(screen.getByRole('button', { name: 'Edit', pressed: false }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Edit', pressed: true }));
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('Changes is off and disabled while editing', async () => {
    // given
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // then
    const button = screen.getByRole('button', { name: 'Changes' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toBeDisabled();
    expect(screen.getByText('Turn off Edit to see changes')).toBeVisible();
    expect(button).toHaveAccessibleDescription('Turn off Edit to see changes');
  });

  test('hides Changes when the session saved no copy of the note', async () => {
    // given
    const before = vi.fn(() => Promise.resolve(null));
    // when
    renderNote({ before });
    // then
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changes' })).not.toBeInTheDocument();
  });

  test('re-reads the saved copy when the vault changes', async () => {
    // given
    const before = vi.fn(() => Promise.resolve(null));
    let vaultChanged: () => void = () => undefined;
    const onChanged = vi.fn((cb: () => void) => {
      vaultChanged = cb;
      return () => undefined;
    });
    renderNote({ before, onChanged });
    await screen.findByRole('heading', { name: 'Findings' });
    before.mockClear();
    // when
    act(() => {
      vaultChanged();
    });
    // then
    await vi.waitFor(() => {
      expect(before).toHaveBeenCalledWith('t1', 'Spike.md');
    });
  });

  test('typing in a note marks its file tab unsaved', async () => {
    // given
    renderNote();
    await editNote();
    // when
    act(() => {
      monaco.change.value('## Results\n');
    });
    // then
    expect(draftPaths()).toEqual(['vault:Spike.md']);
    expect(useMaple.getState().drafts.t1['vault:Spike.md']).toEqual({ text: '## Results\n', disk: '## Findings\n' });
  });

  test('Ctrl+S saves a note with vault.write and clears the draft', async () => {
    // given
    const write = vi.fn(() => Promise.resolve());
    renderNote({ write });
    const editor = await editNote();
    act(() => {
      monaco.change.value('## Results\n');
    });
    // when
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    await vi.waitFor(() => {
      expect(draftPaths()).toEqual([]);
    });
    expect(write).toHaveBeenCalledWith('Spike.md', '## Results\n');
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', '## Results\n');
  });

  test('a failed note save shows the error', async () => {
    // given
    const write = vi.fn(() =>
      Promise.reject(
        new Error("Error invoking remote method 'vault:write': Error: writing note: path is outside the vault"),
      ),
    );
    renderNote({ write });
    const editor = await editNote();
    act(() => {
      monaco.change.value('## Results\n');
    });
    // when
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Saving failed: writing note: path is outside the vault',
    );
    expect(draftPaths()).toEqual(['vault:Spike.md']);
  });

  test('a note changed on disk under a draft offers Reload and Keep mine', async () => {
    // given
    const changed: { value: () => void } = { value: () => undefined };
    const read = vi.fn(() => Promise.resolve('## Findings\n'));
    renderNote({
      read,
      onChanged: (cb) => {
        changed.value = cb;
        return vi.fn();
      },
    });
    await editNote();
    act(() => {
      monaco.change.value('## Mine\n');
    });
    read.mockResolvedValue('## Theirs\n');
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await screen.findByText('File changed on disk')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', '## Mine\n');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    // then
    expect(screen.queryByText('File changed on disk')).not.toBeInTheDocument();
    expect(useMaple.getState().drafts.t1['vault:Spike.md']).toEqual({ text: '## Mine\n', disk: '## Theirs\n' });
    // when
    read.mockResolvedValue('## Newer\n');
    act(() => {
      changed.value();
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));
    // then
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', '## Newer\n');
    expect(draftPaths()).toEqual([]);
  });

  test('a note with a draft opens in Edit mode', async () => {
    // given
    useMaple.getState().setDraft('t1', 'vault:Spike.md', { text: '## Mine\n', disk: '## Findings\n' });
    // when
    renderNote();
    // then
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-value', '## Mine\n');
    expect(screen.getByRole('button', { name: 'Edit', pressed: true })).toBeInTheDocument();
  });

  test.each([
    {
      name: 'saving',
      clear: async () => {
        fireEvent.keyDown(screen.getByTestId('editor'), { key: 's', ctrlKey: true });
        await vi.waitFor(() => {
          expect(draftPaths()).toEqual([]);
        });
      },
    },
    {
      name: 'typing back to the note text',
      clear: () => {
        act(() => {
          monaco.change.value('## Findings\n');
        });
        return Promise.resolve();
      },
    },
    {
      name: 'reloading',
      clear: () => userEvent.click(screen.getByRole('button', { name: 'Reload' })),
    },
  ])('a note opened with a draft stays in Edit mode after $name', async ({ clear }) => {
    // given
    useMaple.getState().setDraft('t1', 'vault:Spike.md', { text: '## Mine\n', disk: '## Older\n' });
    renderNote();
    await screen.findByTestId('editor');
    // when
    await clear();
    // then
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit', pressed: true })).toBeInTheDocument();
  });

  test('Ctrl+S on a note without a draft does not write it', async () => {
    // given
    const write = vi.fn(() => Promise.resolve());
    renderNote({ write });
    const editor = await editNote();
    // when
    const handled = !fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    expect(handled).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  test('a note in a folder saves to its path inside the vault', async () => {
    // given
    const write = vi.fn(() => Promise.resolve());
    fakeMaple({ vault: { read: () => Promise.resolve('## Findings\n'), write } });
    render(<NoteView tabId="t1" path="vault:Projects/Spike.md" noteChanges={false} toolbar={slot} />);
    const editor = await editNote();
    act(() => {
      monaco.change.value('## Results\n');
    });
    // when
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    await vi.waitFor(() => {
      expect(write).toHaveBeenCalledWith('Projects/Spike.md', '## Results\n');
    });
  });

  test.each([
    {
      view: 'the note editor',
      open: async () => {
        renderNote();
        return editNote();
      },
    },
    {
      view: 'Changes in file',
      open: () => {
        renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
        return screen.findByTestId('editor');
      },
    },
    {
      view: 'Changes side by side',
      open: () => {
        localStorage.setItem('maple.viewMode', 'side-by-side');
        renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
        return screen.findByTestId('diff-editor');
      },
    },
  ])('wraps lines by default in $view', async ({ open }) => {
    // given
    // when
    const editor = await open();
    // then
    expect(editor).toHaveAttribute('data-wrap', 'on');
  });

  test('wraps code blocks in the formatted note by default', async () => {
    // given
    renderNote();
    // when
    await screen.findByRole('heading', { name: 'Findings' });
    // then
    expect(screen.getByTestId('note-overview').parentElement?.className).toMatch(/wrapped/);
    expect(screen.getByRole('button', { name: 'Wrap' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Wrap turns wrapping off and saves the choice', async () => {
    // given
    renderNote();
    await screen.findByRole('heading', { name: 'Findings' });
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Wrap' }));
    // then
    expect(screen.getByRole('button', { name: 'Wrap' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('note-overview').parentElement?.className).not.toMatch(/wrapped/);
    expect(localStorage.getItem('maple.noteWrap')).toBe('off');
    expect(await editNote()).toHaveAttribute('data-wrap', 'off');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Wrap' }));
    // then
    expect(localStorage.getItem('maple.noteWrap')).toBe('on');
    expect(screen.getByTestId('editor')).toHaveAttribute('data-wrap', 'on');
  });

  test('reads a saved Wrap choice on mount', async () => {
    // given
    localStorage.setItem('maple.noteWrap', 'off');
    // when
    renderNote();
    // then
    expect(await screen.findByRole('button', { name: 'Wrap' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('wraps by default when storage throws', async () => {
    // given
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('reading storage: blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('writing storage: blocked');
    });
    // when
    renderNote();
    // then
    const button = await screen.findByRole('button', { name: 'Wrap' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    // when
    await userEvent.click(button);
    // then
    expect(screen.getByRole('button', { name: 'Wrap' })).toHaveAttribute('aria-pressed', 'false');
  });

  test.each([
    { view: 'Changes in file', mode: 'in-file', testId: 'editor' },
    { view: 'Changes side by side', mode: 'side-by-side', testId: 'diff-editor' },
  ])('Wrap turns wrapping off in $view', async ({ mode, testId }) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    renderNote({ before: vi.fn(() => Promise.resolve('## Draft\n')) });
    await screen.findByTestId(testId);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Wrap' }));
    // then
    expect(screen.getByTestId(testId)).toHaveAttribute('data-wrap', 'off');
  });

  test('keeps Wrap off when another note opens', async () => {
    // given
    fakeMaple({ vault: { read: vi.fn((path: string) => Promise.resolve(`## ${path}\n`)) } });
    const props = {
      tabId: 't1',
      noteChanges: false,
    };
    const { rerender } = render(<NoteView {...props} path="vault:One.md" toolbar={slot} />);
    await screen.findByRole('heading', { name: 'One.md' });
    await userEvent.click(screen.getByRole('button', { name: 'Wrap' }));
    // when
    rerender(<NoteView {...props} path="vault:Two.md" toolbar={slot} />);
    await screen.findByRole('heading', { name: 'Two.md' });
    // then
    expect(screen.getByRole('button', { name: 'Wrap' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('note-overview').parentElement?.className).not.toMatch(/wrapped/);
  });

  test('wraps for an unknown saved Wrap choice', async () => {
    // given
    localStorage.setItem('maple.noteWrap', 'sideways');
    // when
    renderNote();
    // then
    expect(await screen.findByRole('button', { name: 'Wrap' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('typing in a note pins its tab', async () => {
    // given
    const onPin = vi.fn();
    renderNote({}, onPin);
    await editNote();
    // when
    act(() => {
      monaco.change.value('## Results\n');
    });
    // then
    expect(onPin).toHaveBeenCalledWith('vault:Spike.md');
  });
});
