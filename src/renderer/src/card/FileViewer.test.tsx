import type { FilePair } from '@shared/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { FileViewer } from './FileViewer';
import { PR_DESCRIPTION } from './prDescription';

vi.mock('./monacoSetup', () => ({}));

const monaco = vi.hoisted(() => {
  const collection = { clear: vi.fn() };
  const editor = {
    createDecorationsCollection: vi.fn(() => collection),
    getScrollTop: vi.fn(() => 120),
    setScrollTop: vi.fn(),
    revealLineInCenter: vi.fn(),
    setSelection: vi.fn(),
    focus: vi.fn(),
    getModel: vi.fn(() => model),
  };
  const model = { getLineMaxColumn: () => 9 };
  const api = {
    editor: { OverviewRulerLane: { Full: 7 } },
    languages: {
      getLanguages: () => [
        { id: 'typescript', extensions: ['.ts'] },
        { id: 'makefile', filenames: ['Makefile'] },
      ],
    },
  };
  const change: { value: (text: string) => void } = { value: () => undefined };
  return { editor, collection, api, change, enabled: { value: false }, slowMount: { value: false } };
});

vi.mock('@monaco-editor/react', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    useMonaco: () => (monaco.enabled.value ? monaco.api : null),
    Editor: (props: {
      value: string;
      language: string | undefined;
      options: { readOnly: boolean };
      onMount: (editor: unknown) => void;
      onChange: (value: string | undefined) => void;
    }) => {
      const { onMount } = props;
      monaco.change.value = props.onChange;
      const instance = useRef({
        ...monaco.editor,
        disposed: false,
        getModel() {
          return this.disposed ? null : monaco.editor.getModel();
        },
      });
      useEffect(() => {
        const mounted = instance.current;
        if (!monaco.slowMount.value) {
          onMount(mounted);
          return;
        }
        const timer = setTimeout(() => {
          onMount(mounted);
        }, 10);
        return () => {
          clearTimeout(timer);
        };
      }, [onMount]);
      useEffect(() => {
        const mounted = instance.current;
        return () => {
          mounted.disposed = true;
        };
      }, []);
      return (
        <div
          data-testid="editor"
          data-value={props.value}
          data-language={props.language}
          data-readonly={String(props.options.readOnly)}
        />
      );
    },
    DiffEditor: (props: {
      original: string;
      modified: string;
      options: { renderSideBySide: boolean; readOnly: boolean };
      onMount: (editor: unknown) => void;
    }) => {
      const { onMount } = props;
      useEffect(() => {
        onMount({ getModifiedEditor: () => monaco.editor });
      }, [onMount]);
      return (
        <div
          data-testid="diff-editor"
          data-original={props.original}
          data-modified={props.modified}
          data-side-by-side={String(props.options.renderSideBySide)}
          data-readonly={String(props.options.readOnly)}
        />
      );
    },
  };
});

const changed: FilePair = { kind: 'text', path: 'src/a.ts', current: 'new\n', base: 'old\n' };

function renderViewer(pair: FilePair, writeFile = vi.fn(() => Promise.resolve())) {
  const maple = fakeMaple({ repo: { readFile: () => Promise.resolve(pair), writeFile } });
  const props = {
    tabId: 't1',
    openFiles: [pair.path, 'README.md'],
    activeFile: pair.path,
    onActivate: vi.fn(),
    onCloseFile: vi.fn(),
    prBody: null,
    line: null,
  };
  return { maple, props, ...render(<FileViewer {...props} />) };
}

describe('FileViewer', () => {
  beforeEach(() => {
    localStorage.clear();
    monaco.enabled.value = false;
    monaco.slowMount.value = false;
    vi.clearAllMocks();
    vi.restoreAllMocks();
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('renders the PR description as Markdown', () => {
    // given
    const readFile = vi.fn();
    const onChanged = vi.fn();
    fakeMaple({ repo: { readFile, onChanged } });
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={[PR_DESCRIPTION]}
        activeFile={PR_DESCRIPTION}
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={'## Summary\n\nHello'}
        line={null}
      />,
    );
    // then
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'PR description' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
    expect(readFile).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('renders a vault note as Markdown', async () => {
    // given
    const readFile = vi.fn();
    const read = vi.fn(() => Promise.resolve('## Findings'));
    fakeMaple({ repo: { readFile }, vault: { read } });
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={['vault:Projects/Maple/Spike.md']}
        activeFile="vault:Projects/Maple/Spike.md"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
      />,
    );
    // then
    expect(await screen.findByRole('heading', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Spike.md' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('Projects/Maple/Spike.md');
    expect(readFile).not.toHaveBeenCalled();
  });

  test('re-reads a vault note each time its tab becomes active', async () => {
    // given
    const read = vi.fn(() => Promise.resolve('## First'));
    fakeMaple({ vault: { read } });
    const props = {
      tabId: 't1',
      openFiles: ['vault:Spike.md', 'README.md'],
      onActivate: vi.fn(),
      onCloseFile: vi.fn(),
      prBody: null,
      line: null,
    };
    const { rerender } = render(<FileViewer {...props} activeFile="vault:Spike.md" />);
    await screen.findByRole('heading', { name: 'First' });
    rerender(<FileViewer {...props} activeFile="README.md" />);
    read.mockResolvedValue('## Second');
    // when
    rerender(<FileViewer {...props} activeFile="vault:Spike.md" />);
    // then
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('renders an editor in file mode by default', async () => {
    // given
    // when
    renderViewer(changed);
    // then
    const editor = await screen.findByTestId('editor');
    expect(editor).toHaveAttribute('data-value', 'new\n');
    expect(screen.getByRole('button', { name: 'In file', pressed: true })).toBeInTheDocument();
  });

  test('switches to side by side and saves the mode', async () => {
    // given
    renderViewer(changed);
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    // then
    const diff = screen.getByTestId('diff-editor');
    expect(diff).toHaveAttribute('data-original', 'old\n');
    expect(diff).toHaveAttribute('data-modified', 'new\n');
    expect(diff).toHaveAttribute('data-side-by-side', 'true');
    expect(localStorage.getItem('maple.viewMode')).toBe('side-by-side');
  });

  test('reads the saved mode on mount', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    // when
    renderViewer(changed);
    // then
    expect(await screen.findByTestId('diff-editor')).toBeInTheDocument();
  });

  test('shows an empty original for an added file side by side', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    // when
    renderViewer({ kind: 'text', path: 'src/new.ts', current: 'x\n', base: null });
    // then
    expect(await screen.findByTestId('diff-editor')).toHaveAttribute('data-original', '');
  });

  test.each(['in-file', 'side-by-side'])('shows an unchanged file in a plain editor in %s mode', async (mode) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    // when
    renderViewer({ kind: 'text', path: 'src/a.ts', current: 'same\n', base: 'same\n' });
    // then
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-value', 'same\n');
    expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument();
  });

  test.each<{ name: string; pair: FilePair; text: string }>([
    { name: 'binary', pair: { kind: 'binary', path: 'a.png' }, text: 'Binary file, not shown' },
    {
      name: 'tooLarge',
      pair: { kind: 'tooLarge', path: 'big.json', bytes: 2_621_440 },
      text: 'File too large to show (2.5 MB)',
    },
  ])('shows a message for a $name file', async ({ pair, text }) => {
    // given
    // when
    renderViewer(pair);
    // then
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
  });

  test('shows the base text under a notice for a deleted file', async () => {
    // given
    // when
    renderViewer({ kind: 'text', path: 'src/old.ts', current: null, base: 'old\n' });
    // then
    expect(await screen.findByText('Deleted in this branch')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'old\n');
  });

  test('activates and closes file tabs', async () => {
    // given
    const { props } = renderViewer(changed);
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'README.md' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close src/a.ts' }));
    // then
    expect(props.onActivate).toHaveBeenCalledWith('README.md');
    expect(props.onCloseFile).toHaveBeenCalledWith('src/a.ts');
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test('reloads the open file when the repo changes', async () => {
    // given
    let changedCb: () => void = () => undefined;
    let current = 'one\n';
    fakeMaple({
      repo: {
        readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current, base: null }),
        onChanged: (_tabId, cb) => {
          changedCb = cb;
          return () => undefined;
        },
      },
    });
    render(
      <FileViewer
        tabId="t1"
        openFiles={['a.ts']}
        activeFile="a.ts"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
      />,
    );
    await screen.findByTestId('editor');
    // when
    current = 'two\n';
    changedCb();
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
    });
  });

  test('decorates changed lines and picks the language from the extension', async () => {
    // given
    monaco.enabled.value = true;
    // when
    renderViewer({ kind: 'text', path: 'src/a.ts', current: 'one\nnew\n', base: 'one\nold\n' });
    // then
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-language', 'typescript');
    await vi.waitFor(() => {
      expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([
        {
          range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
          options: {
            isWholeLine: true,
            className: 'line-chg',
            marginClassName: 'margin-chg',
            overviewRuler: { color: '#d4b106', position: 7 },
            hoverMessage: { value: 'Was:\n```\nold\n```' },
          },
        },
      ]);
    });
  });

  test.each([
    { name: 'in file', start: 'side-by-side', click: 'In file', want: 'in-file', testId: 'editor' },
    { name: 'side by side', start: 'in-file', click: 'Side by side', want: 'side-by-side', testId: 'diff-editor' },
  ])('saves $name when chosen', async ({ start, click, want, testId }) => {
    // given
    localStorage.setItem('maple.viewMode', start);
    renderViewer(changed);
    await screen.findByTestId(start === 'in-file' ? 'editor' : 'diff-editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: click }));
    // then
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: click, pressed: true })).toBeInTheDocument();
    expect(localStorage.getItem('maple.viewMode')).toBe(want);
  });

  test('falls back to in file for an unknown saved mode', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'sideways');
    // when
    renderViewer(changed);
    // then
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
  });

  test('works when storage throws', async () => {
    // given
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('reading storage: blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('writing storage: blocked');
    });
    renderViewer(changed);
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    // then
    expect(screen.getByTestId('diff-editor')).toBeInTheDocument();
  });

  test('shows a deleted file in a plain editor in side by side mode', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    // when
    renderViewer({ kind: 'text', path: 'src/old.ts', current: null, base: 'old\n' });
    // then
    expect(await screen.findByText('Deleted in this branch')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'old\n');
    expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument();
  });

  test('renders no file and reads nothing without an active file', () => {
    // given
    const readFile = vi.fn();
    const onChanged = vi.fn();
    fakeMaple({ repo: { readFile, onChanged } });
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={[]}
        activeFile={null}
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
      />,
    );
    // then
    expect(readFile).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  test('ignores a load that finishes after switching files', async () => {
    // given
    let finishFirst: (pair: FilePair) => void = () => undefined;
    fakeMaple({
      repo: {
        readFile: (_tabId, path) =>
          path === 'a.ts'
            ? new Promise((resolve) => {
                finishFirst = resolve;
              })
            : Promise.resolve({ kind: 'text', path, current: 'b\n', base: 'b\n' }),
      },
    });
    const props = {
      tabId: 't1',
      openFiles: ['a.ts', 'b.ts'],
      onActivate: vi.fn(),
      onCloseFile: vi.fn(),
      prBody: null,
      line: null,
    };
    const { rerender } = render(<FileViewer {...props} activeFile="a.ts" />);
    rerender(<FileViewer {...props} activeFile="b.ts" />);
    await screen.findByTestId('editor');
    // when
    await act(async () => {
      finishFirst({ kind: 'text', path: 'a.ts', current: 'a\n', base: 'a\n' });
      await Promise.resolve();
    });
    // then
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'b\n');
  });

  test('stops listening for repo changes on unmount', async () => {
    // given
    const stop = vi.fn();
    fakeMaple({ repo: { onChanged: () => stop } });
    const { unmount } = render(
      <FileViewer
        tabId="t1"
        openFiles={['a.png']}
        activeFile="a.png"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
      />,
    );
    await screen.findByText('Binary file, not shown');
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalledOnce();
  });

  test('reveals the requested line after the file loads', async () => {
    // given
    fakeMaple({ repo: { readFile: () => Promise.resolve(changed) } });
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={['src/a.ts']}
        activeFile="src/a.ts"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={3}
      />,
    );
    // then
    await vi.waitFor(() => {
      expect(monaco.editor.revealLineInCenter).toHaveBeenCalledWith(3);
    });
    expect(monaco.editor.setSelection).toHaveBeenCalledWith({
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 9,
    });
    expect(monaco.editor.focus).toHaveBeenCalledOnce();
  });

  test('reveals the line in the new editor after switching from another file', async () => {
    // given
    fakeMaple({
      repo: { readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current: 'x\n', base: 'x\n' }) },
    });
    const props = {
      tabId: 't1',
      openFiles: ['a.ts', 'b.ts'],
      onActivate: vi.fn(),
      onCloseFile: vi.fn(),
      prBody: null,
    };
    const { rerender } = render(<FileViewer {...props} activeFile="a.ts" line={null} />);
    await screen.findByTestId('editor');
    monaco.slowMount.value = true;
    // when
    rerender(<FileViewer {...props} activeFile="b.ts" line={5} />);
    // then
    await vi.waitFor(() => {
      expect(monaco.editor.revealLineInCenter).toHaveBeenCalledWith(5);
    });
    expect(monaco.editor.revealLineInCenter.mock.contexts).toEqual([expect.objectContaining({ disposed: false })]);
  });

  test.each(['in-file', 'side-by-side'])('keeps the scroll position on reload in %s mode', async (mode) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    let changedCb: () => void = () => undefined;
    let current = 'one\n';
    fakeMaple({
      repo: {
        readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current, base: 'zero\n' }),
        onChanged: (_tabId, cb) => {
          changedCb = cb;
          return () => undefined;
        },
      },
    });
    render(
      <FileViewer
        tabId="t1"
        openFiles={['a.ts']}
        activeFile="a.ts"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
      />,
    );
    await screen.findByTestId(mode === 'in-file' ? 'editor' : 'diff-editor');
    expect(monaco.editor.setScrollTop).not.toHaveBeenCalled();
    // when
    current = 'two\n';
    changedCb();
    // then
    await vi.waitFor(() => {
      expect(monaco.editor.setScrollTop).toHaveBeenCalledWith(120);
    });
  });

  test.each([
    { path: 'Makefile', want: 'makefile' },
    { path: 'notes.xyz', want: null },
  ])('picks language $want for $path', async ({ path, want }) => {
    // given
    monaco.enabled.value = true;
    // when
    renderViewer({ kind: 'text', path, current: 'x\n', base: 'x\n' });
    // then
    const editor = await screen.findByTestId('editor');
    expect(editor.getAttribute('data-language')).toBe(want);
  });

  test('adds no decorations to an unchanged file', async () => {
    // given
    monaco.enabled.value = true;
    // when
    renderViewer({ kind: 'text', path: 'src/a.ts', current: 'same\n', base: 'same\n' });
    // then
    await screen.findByTestId('editor');
    await vi.waitFor(() => {
      expect(monaco.editor.createDecorationsCollection).toHaveBeenCalled();
    });
    expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([]);
  });

  test.each<{ name: string; mode: string; pair: FilePair; testId: string; want: string }>([
    { name: 'in file', mode: 'in-file', pair: changed, testId: 'editor', want: 'false' },
    { name: 'side by side', mode: 'side-by-side', pair: changed, testId: 'diff-editor', want: 'true' },
    {
      name: 'a deleted file',
      mode: 'in-file',
      pair: { kind: 'text', path: 'src/a.ts', current: null, base: 'old\n' },
      testId: 'editor',
      want: 'true',
    },
  ])('the in file editor is editable for a text file: $name', async ({ mode, pair, testId, want }) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    // when
    renderViewer(pair);
    // then
    expect(await screen.findByTestId(testId)).toHaveAttribute('data-readonly', want);
  });

  test('typing marks the file tab dirty and Ctrl+S saves it', async () => {
    // given
    const writeFile = vi.fn(() => Promise.resolve());
    renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' }, writeFile);
    const editor = await screen.findByTestId('editor');
    // when
    act(() => {
      monaco.change.value('two\n');
    });
    // then
    expect(screen.getByRole('tab', { name: '● a.ts' })).toHaveTextContent('● a.ts');
    // when
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    await vi.waitFor(() => {
      expect(screen.getByRole('tab', { name: 'a.ts' })).toBeInTheDocument();
    });
    expect(writeFile).toHaveBeenCalledWith('t1', 'a.ts', 'two\n');
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
  });

  test('a draft survives remounting the viewer', async () => {
    // given
    const { unmount } = renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    act(() => {
      monaco.change.value('two\n');
    });
    unmount();
    // when
    renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
    });
    expect(screen.getByRole('tab', { name: '● a.ts' })).toBeInTheDocument();
  });

  test('shows File changed on disk when the file changes under a draft', async () => {
    // given
    let changedCb: () => void = () => undefined;
    let current = 'one\n';
    const writeFile = vi.fn(() => Promise.resolve());
    fakeMaple({
      repo: {
        readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current, base: 'one\n' }),
        writeFile,
        onChanged: (_tabId, cb) => {
          changedCb = cb;
          return () => undefined;
        },
      },
    });
    render(
      <FileViewer
        tabId="t1"
        openFiles={['a.ts']}
        activeFile="a.ts"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
      />,
    );
    await screen.findByTestId('editor');
    act(() => {
      monaco.change.value('two\n');
    });
    // when
    current = 'three\n';
    changedCb();
    // then
    expect(await screen.findByText('File changed on disk')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    // then
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'three\n');
    expect(screen.queryByText('File changed on disk')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'a.ts' })).toBeInTheDocument();
    // when
    act(() => {
      monaco.change.value('four\n');
    });
    current = 'five\n';
    changedCb();
    await userEvent.click(await screen.findByRole('button', { name: 'Keep mine' }));
    // then
    expect(screen.queryByText('File changed on disk')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'four\n');
    // when
    fireEvent.keyDown(screen.getByTestId('editor'), { key: 's', ctrlKey: true });
    // then
    await vi.waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('t1', 'a.ts', 'four\n');
    });
  });
});
