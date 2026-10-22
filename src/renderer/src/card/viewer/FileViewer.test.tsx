import type { DiffLines, FilePair } from '@shared/types/files';
import type { ReviewComment } from '@shared/types/github';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { FileViewer } from './FileViewer';
import { PR_DESCRIPTION } from '@renderer/card/prDescription';
import { CARD_DESCRIPTION } from '@renderer/card/cardDescription';

vi.mock('./monacoSetup', () => ({}));

const monaco = vi.hoisted(() => {
  const collection = { clear: vi.fn() };
  const zones = {
    addZone: vi.fn<(zone: { afterLineNumber: number; domNode: HTMLElement; heightInPx: number }) => string>(() => 'z1'),
    removeZone: vi.fn(),
    layoutZone: vi.fn(),
  };
  const editor = {
    changeViewZones: vi.fn((cb: (accessor: typeof zones) => void) => {
      cb(zones);
    }),
    createDecorationsCollection: vi.fn(() => collection),
    getScrollTop: vi.fn(() => 120),
    setScrollTop: vi.fn(),
    revealLineInCenter: vi.fn(),
    setSelection: vi.fn(),
    focus: vi.fn(),
    getModel: vi.fn(() => model),
    getSelection: vi.fn(() => ({ startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 })),
    onDidChangeCursorSelection: vi.fn((cb: (e: { selection: Selection }) => void) => {
      cursor.value = cb;
      return { dispose: vi.fn() };
    }),
  };
  type Selection = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  const cursor: { value: (e: { selection: Selection }) => void } = { value: () => undefined };
  const model = { getLineMaxColumn: () => 9 };
  const api = {
    editor: { OverviewRulerLane: { Full: 7 }, MinimapPosition: { Gutter: 2 } },
    languages: {
      getLanguages: () => [
        { id: 'typescript', extensions: ['.ts'] },
        { id: 'makefile', filenames: ['Makefile'] },
      ],
    },
  };
  const change: { value: (text: string) => void } = { value: () => undefined };
  return {
    editor,
    zones,
    collection,
    api,
    change,
    cursor,
    enabled: { value: false },
    slowMount: { value: false },
  };
});

vi.mock('@monaco-editor/react', async () => {
  const { useEffect, useRef, useState } = await import('react');
  return {
    useMonaco: () => (monaco.enabled.value ? monaco.api : null),
    Editor: (props: {
      value: string;
      language: string | undefined;
      options: { readOnly: boolean; minimap?: { enabled: boolean; size: string } };
      onMount: (editor: unknown) => void;
      onChange: (value: string | undefined) => void;
    }) => {
      const { onMount } = props;
      const [ready, setReady] = useState(false);
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
          setReady(true);
          return;
        }
        const timer = setTimeout(() => {
          onMount(mounted);
          setReady(true);
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
          data-mounted={String(ready)}
          data-value={props.value}
          data-language={props.language}
          data-readonly={String(props.options.readOnly)}
          data-minimap={JSON.stringify(props.options.minimap)}
        />
      );
    },
    DiffEditor: (props: {
      original: string;
      modified: string;
      options: { renderSideBySide: boolean; readOnly: boolean; minimap?: { enabled: boolean; size: string } };
      onMount: (editor: unknown) => void;
    }) => {
      const { onMount } = props;
      const [ready, setReady] = useState(false);
      useEffect(() => {
        onMount({ getModifiedEditor: () => monaco.editor });
        setReady(true);
      }, [onMount]);
      return (
        <div
          data-testid="diff-editor"
          data-mounted={String(ready)}
          data-original={props.original}
          data-modified={props.modified}
          data-side-by-side={String(props.options.renderSideBySide)}
          data-readonly={String(props.options.readOnly)}
          data-minimap={JSON.stringify(props.options.minimap)}
        />
      );
    },
  };
});

const review = (id: number, body: string, replyTo: number | null = null): ReviewComment => ({
  id,
  replyTo,
  startLine: null,
  path: 'src/a.ts',
  line: 3,
  author: 'tahardi',
  body,
  threadId: null,
  resolved: false,
});

const same: FilePair = { kind: 'text', path: 'src/a.ts', current: 'same\n', base: 'same\n' };

const select = (start: number, end: number, endColumn = 4) => ({
  selection: { startLineNumber: start, startColumn: 1, endLineNumber: end, endColumn },
});

async function moveCursor(event: ReturnType<typeof select>) {
  await vi.waitFor(() => {
    expect(monaco.editor.onDidChangeCursorSelection).toHaveBeenCalled();
  });
  act(() => {
    monaco.cursor.value(event);
  });
}

const resize: { value: () => void } = { value: () => undefined };

const disconnect = vi.fn();

const changed: FilePair = { kind: 'text', path: 'src/a.ts', current: 'new\n', base: 'old\n' };

function renderViewer(
  pair: FilePair,
  writeFile = vi.fn(() => Promise.resolve()),
  canComment = false,
  comments = vi.fn(() => Promise.resolve<ReviewComment[]>([])),
  diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] }, unpushed: [] })),
) {
  const maple = fakeMaple({
    repo: { readFile: () => Promise.resolve(pair), writeFile },
    pr: { comments, diffLines },
  });
  const props = {
    tabId: 't1',
    openFiles: [pair.path, 'README.md'],
    activeFile: pair.path,
    onActivate: vi.fn(),
    onCloseFile: vi.fn(),
    prBody: null,
    line: null,
    canComment,
    prFetchedAt: null,
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
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver(cb: () => void) {
        resize.value = cb;
        return { observe: vi.fn(), disconnect };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    { name: 'PR description', path: PR_DESCRIPTION, prBody: '## Summary\n\nHello', cardBody: undefined },
    { name: 'Card description', path: CARD_DESCRIPTION, prBody: null, cardBody: '## Summary\n\nShip it' },
  ])('renders the $name as Markdown', ({ name, path, prBody, cardBody }) => {
    // given
    const readFile = vi.fn();
    const onChanged = vi.fn();
    fakeMaple({ repo: { readFile, onChanged } });
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={[path]}
        activeFile={path}
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={prBody}
        cardBody={cardBody}
        line={null}
        canComment={false}
        prFetchedAt={null}
      />,
    );
    // then
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
    expect(readFile).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'PR description', path: PR_DESCRIPTION },
    { name: 'Card description', path: CARD_DESCRIPTION },
  ])('closes the $name from its tab', async ({ name, path }) => {
    // given
    const onCloseFile = vi.fn();
    fakeMaple();
    render(
      <FileViewer
        tabId="t1"
        openFiles={[path]}
        activeFile={path}
        onActivate={vi.fn()}
        onCloseFile={onCloseFile}
        prBody="Hello"
        cardBody="Ship it"
        line={null}
        canComment={false}
        prFetchedAt={null}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: `Close ${name}` }));
    // then
    expect(onCloseFile).toHaveBeenCalledWith(path);
  });

  test('shows each description with its own body', () => {
    // given
    fakeMaple();
    const props = {
      tabId: 't1',
      openFiles: [PR_DESCRIPTION, CARD_DESCRIPTION],
      onActivate: vi.fn(),
      onCloseFile: vi.fn(),
      prBody: '## From the PR',
      cardBody: '## From the card',
      line: null,
      canComment: false,
      prFetchedAt: null,
    };
    const { rerender } = render(<FileViewer {...props} activeFile={PR_DESCRIPTION} />);
    // when
    rerender(<FileViewer {...props} activeFile={CARD_DESCRIPTION} />);
    // then
    expect(screen.getByRole('heading', { name: 'From the card' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'From the PR' })).not.toBeInTheDocument();
    // when
    rerender(<FileViewer {...props} activeFile={PR_DESCRIPTION} />);
    // then
    expect(screen.getByRole('heading', { name: 'From the PR' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'From the card' })).not.toBeInTheDocument();
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
        canComment={false}
        prFetchedAt={null}
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
      canComment: false,
      prFetchedAt: null,
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
        canComment={false}
        prFetchedAt={null}
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
            minimap: { color: '#d4b106', position: 2 },
            hoverMessage: { value: 'Was:\n```\nold\n```' },
          },
        },
      ]);
    });
  });

  test.each([
    { name: 'in file', mode: 'in-file', pair: changed, testId: 'editor' },
    { name: 'side by side', mode: 'side-by-side', pair: changed, testId: 'diff-editor' },
    {
      name: 'a deleted file',
      mode: 'in-file',
      pair: { kind: 'text', path: 'src/old.ts', current: null, base: 'old\n' } as const,
      testId: 'editor',
    },
  ])('turns on the minimap for $name', async ({ mode, pair, testId }) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    // when
    renderViewer(pair);
    // then
    const editor = await screen.findByTestId(testId);
    const minimap: unknown = JSON.parse(editor.getAttribute('data-minimap') ?? 'null');
    expect(minimap).toEqual({ enabled: true, renderCharacters: false, size: 'fit', showSlider: 'always' });
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
        canComment={false}
        prFetchedAt={null}
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
      canComment: false,
      prFetchedAt: null,
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
        canComment={false}
        prFetchedAt={null}
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
        canComment={false}
        prFetchedAt={null}
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
      canComment: false,
      prFetchedAt: null,
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
        canComment={false}
        prFetchedAt={null}
      />,
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId(mode === 'in-file' ? 'editor' : 'diff-editor')).toHaveAttribute('data-mounted', 'true');
    });
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
        canComment={false}
        prFetchedAt={null}
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

  test('typing back to the file text clears the draft', async () => {
    // given
    renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    act(() => {
      monaco.change.value('two\n');
    });
    // when
    act(() => {
      monaco.change.value('one\n');
    });
    // then
    expect(screen.getByRole('tab', { name: 'a.ts' })).toBeInTheDocument();
    expect(useMaple.getState().drafts.t1).toEqual({});
  });

  test.each([
    { name: 'Ctrl+S without a draft', type: false, key: 's', ctrlKey: true },
    { name: 'a plain s', type: true, key: 's', ctrlKey: false },
    { name: 'Ctrl+A', type: true, key: 'a', ctrlKey: true },
  ])('does not save on $name', async ({ type, key, ctrlKey }) => {
    // given
    const writeFile = vi.fn(() => Promise.resolve());
    renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' }, writeFile);
    const editor = await screen.findByTestId('editor');
    if (type) {
      act(() => {
        monaco.change.value('two\n');
      });
    }
    // when
    const handled = !fireEvent.keyDown(editor, { key, ctrlKey });
    // then
    expect(writeFile).not.toHaveBeenCalled();
    expect(handled).toBe(ctrlKey && key === 's');
  });

  test('keeps the draft when saving fails', async () => {
    // given
    const writeFile = vi.fn(() => Promise.reject(new Error('writing file: disk full')));
    fakeMaple({
      repo: {
        readFile: (_tabId, path) => Promise.resolve({ kind: 'text', path, current: 'one\n', base: 'one\n' }),
        writeFile,
      },
    });
    const props = {
      tabId: 't1',
      openFiles: ['a.ts', 'b.ts'],
      onActivate: vi.fn(),
      onCloseFile: vi.fn(),
      prBody: null,
      line: null,
      canComment: false,
      prFetchedAt: null,
    };
    const { rerender } = render(<FileViewer {...props} activeFile="a.ts" />);
    const editor = await screen.findByTestId('editor');
    act(() => {
      monaco.change.value('two\n');
    });
    // when
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    await vi.waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith('t1', 'a.ts', 'two\n');
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('tab', { name: '● a.ts' })).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
    expect(screen.getByRole('alert')).toHaveTextContent('Saving failed: writing file: disk full');
    // when
    rerender(<FileViewer {...props} activeFile="b.ts" />);
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'one\n');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('marks changed lines from the draft text', async () => {
    // given
    monaco.enabled.value = true;
    renderViewer({ kind: 'text', path: 'src/a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    // when
    act(() => {
      monaco.change.value('one\ntwo\n');
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

  test('Comment opens the line comment form for the cursor line', async () => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAttribute('title');
    });
    // when
    await userEvent.click(button);
    // then
    expect(screen.getByRole('heading', { name: 'Comment on src/a.ts:3' })).toBeInTheDocument();
  });

  test.each([
    { name: 'the selected lines', end: 4, endColumn: 6, want: 'Comment on src/a.ts:2-4' },
    {
      name: 'the selected lines up to a selection ending at the start of a line',
      end: 5,
      endColumn: 1,
      want: 'Comment on src/a.ts:2-4',
    },
  ])('Comment opens the form for $name', async ({ end, endColumn, want }) => {
    // given
    const comment = vi.fn(() => Promise.resolve());
    fakeMaple({
      repo: { readFile: () => Promise.resolve(changed) },
      pr: { comment, diffLines: () => Promise.resolve({ ranges: { 'src/a.ts': [[1, 10]] }, unpushed: [] }) },
    });
    render(
      <FileViewer
        tabId="t1"
        openFiles={['src/a.ts']}
        activeFile="src/a.ts"
        onActivate={vi.fn()}
        onCloseFile={vi.fn()}
        prBody={null}
        line={null}
        canComment
        prFetchedAt={null}
      />,
    );
    const button = await screen.findByRole('button', { name: 'Comment' });
    await moveCursor(select(2, end, endColumn));
    await vi.waitFor(() => {
      expect(button).not.toHaveAttribute('title');
    });
    // when
    await userEvent.click(button);
    expect(screen.getByRole('heading', { name: want })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'why?');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(comment).toHaveBeenCalledWith('t1', 'src/a.ts', 2, 4, 'why?');
  });

  test('explains why Comment does nothing on lines that leave the PR diff', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] }, unpushed: [] }));
    renderViewer(changed, undefined, true, undefined, diffLines);
    await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalled();
    });
    await moveCursor(select(8, 12));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't comment on lines 8-12. GitHub only accepts comments on lines in the PR diff",
    );
  });

  test.each<{ name: string; lines: DiffLines; cursor: number; reason: string }>([
    {
      name: 'outside the PR diff',
      lines: { ranges: { 'src/a.ts': [[1, 10]] }, unpushed: [] },
      cursor: 20,
      reason: 'GitHub only accepts comments on lines in the PR diff',
    },
    {
      name: 'in a file the PR does not change',
      lines: { ranges: { 'README.md': [[1, 10]] }, unpushed: [] },
      cursor: 3,
      reason: 'GitHub only accepts comments on lines in the PR diff',
    },
    {
      name: 'in a file with edits that are not pushed',
      lines: { ranges: { 'src/a.ts': [[1, 10]] }, unpushed: ['src/a.ts'] },
      cursor: 3,
      reason: 'Push your edits first: line numbers would not match the PR',
    },
    {
      name: 'outside the PR diff in a file with edits that are not pushed',
      lines: { ranges: { 'src/a.ts': [[1, 10]] }, unpushed: ['src/a.ts'] },
      cursor: 20,
      reason: 'Push your edits first: line numbers would not match the PR',
    },
  ])('explains why Comment does nothing on a line $name', async ({ lines, cursor, reason }) => {
    // given
    const diffLines = vi.fn(() => Promise.resolve(lines));
    renderViewer(changed, undefined, true, undefined, diffLines);
    await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalled();
    });
    await moveCursor(select(cursor, cursor));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(`Can't comment on line ${String(cursor)}. ${reason}`);
    expect(screen.queryByRole('heading', { name: /^Comment on / })).not.toBeInTheDocument();
  });

  test('drops the explanation and opens the form once the cursor moves into the PR diff', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] }, unpushed: [] }));
    renderViewer(changed, undefined, true, undefined, diffLines);
    await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalled();
    });
    await moveCursor(select(20, 20));
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await screen.findByRole('alert');
    // when
    await moveCursor(select(10, 10));
    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.getByRole('heading', { name: 'Comment on src/a.ts:10' })).toBeInTheDocument();
  });

  test.each<{ name: string; canComment: boolean; mode: string; pair: FilePair; testId: string }>([
    { name: 'without an open PR', canComment: false, mode: 'in-file', pair: changed, testId: 'editor' },
    { name: 'side by side', canComment: true, mode: 'side-by-side', pair: changed, testId: 'diff-editor' },
    {
      name: 'for a deleted file',
      canComment: true,
      mode: 'in-file',
      pair: { kind: 'text', path: 'src/a.ts', current: null, base: 'old\n' },
      testId: 'editor',
    },
  ])('hides Comment $name', async ({ canComment, mode, pair, testId }) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    // when
    renderViewer(pair, undefined, canComment);
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId(testId)).toHaveAttribute('data-mounted', 'true');
    });
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument();
  });

  test('shows each PR review thread in a zone under its line', async () => {
    // given
    const comments = vi.fn(() =>
      Promise.resolve([
        review(101, 'why?'),
        review(102, 'because', 101),
        { ...review(103, 'elsewhere'), path: 'README.md' },
      ]),
    );
    // when
    renderViewer(same, undefined, true, comments);
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    expect(zone).toMatchObject({ afterLineNumber: 3 });
    const box = await within(zone.domNode).findByRole('textbox', { name: 'Reply' });
    expect(box).toHaveValue('');
    expect(zone.domNode).toHaveTextContent(/why\?.*because/);
    expect(zone.domNode).not.toHaveTextContent('elsewhere');
    expect(comments).toHaveBeenCalledWith('t1');
  });

  test('reports each read of the review comments', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([review(101, 'why?')]));
    const onComments = vi.fn();
    const { props, rerender } = renderViewer(same, undefined, true, comments);
    // when
    rerender(<FileViewer {...props} onComments={onComments} />);
    // then
    await vi.waitFor(() => {
      expect(onComments).toHaveBeenCalledWith([review(101, 'why?')]);
    });
  });

  test('adds no zone without review comments', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    // when
    renderViewer(same, undefined, true, comments);
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveAttribute('data-mounted', 'true');
      expect(comments).toHaveBeenCalled();
    });
    expect(monaco.zones.addZone).not.toHaveBeenCalled();
  });

  test('grows a zone with its thread box', async () => {
    // given
    renderViewer(
      same,
      undefined,
      true,
      vi.fn(() => Promise.resolve([review(101, 'why?')])),
    );
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const content = zone.domNode.firstElementChild;
    if (!(content instanceof HTMLElement)) {
      throw new Error('finding zone content');
    }
    vi.spyOn(content, 'offsetHeight', 'get').mockReturnValue(180);
    // when
    resize.value();
    // then
    expect(zone.heightInPx).toBe(180);
    expect(monaco.zones.layoutZone).toHaveBeenCalledWith('z1');
  });

  test.each([
    {
      name: 'another file opens',
      leave: (view: ReturnType<typeof renderViewer>) => {
        view.rerender(<FileViewer {...view.props} activeFile="README.md" />);
      },
    },
    {
      name: 'the viewer unmounts',
      leave: (view: ReturnType<typeof renderViewer>) => {
        view.unmount();
      },
    },
  ])('removes the zones when $name', async ({ leave }) => {
    // given
    const view = renderViewer(
      same,
      undefined,
      true,
      vi.fn(() => Promise.resolve([review(101, 'why?')])),
    );
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    // when
    leave(view);
    // then
    expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
  });

  test('re-reads the review comments when the PR summary refreshes', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    const { props, rerender } = renderViewer(same, undefined, true, comments);
    await vi.waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(1);
    });
    // when
    rerender(<FileViewer {...props} prFetchedAt="2026-10-22T12:00:00.000Z" />);
    // then
    await vi.waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
    });
  });

  test('re-reads the review comments after posting a reply', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([review(101, 'why?')]));
    renderViewer(same, undefined, true, comments);
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const box = await within(zone.domNode).findByRole('textbox', { name: 'Reply' });
    // when
    fireEvent.change(box, { target: { value: 'thanks' } });
    fireEvent.click(within(zone.domNode).getByRole('button', { name: 'Post' }));
    // then
    await vi.waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
    });
  });

  test('keeps the zones and an unsent reply when the review comments refresh', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([review(101, 'why?')]));
    const { props, rerender } = renderViewer(same, undefined, true, comments);
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const box = await within(zone.domNode).findByRole('textbox', { name: 'Reply' });
    fireEvent.change(box, { target: { value: 'half written' } });
    // when
    rerender(<FileViewer {...props} prFetchedAt="2026-10-22T12:00:00.000Z" />);
    // then
    await vi.waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
    });
    await act(() => Promise.resolve());
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    expect(monaco.zones.removeZone).not.toHaveBeenCalled();
    expect(within(zone.domNode).getByRole('textbox', { name: 'Reply' })).toBe(box);
    expect(box).toHaveValue('half written');
  });

  test('removes only the zone of a thread that disappears', async () => {
    // given
    monaco.zones.addZone.mockReturnValueOnce('z1').mockReturnValueOnce('z2');
    const comments = vi
      .fn<() => Promise<ReviewComment[]>>()
      .mockResolvedValueOnce([review(101, 'why?'), { ...review(105, 'nit'), line: 7 }])
      .mockResolvedValue([review(101, 'why?')]);
    const { props, rerender } = renderViewer(same, undefined, true, comments);
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(2);
    });
    // when
    rerender(<FileViewer {...props} prFetchedAt="2026-10-22T12:00:00.000Z" />);
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.removeZone).toHaveBeenCalledWith('z2');
    });
    expect(monaco.zones.removeZone).not.toHaveBeenCalledWith('z1');
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(2);
  });

  test('ignores a resize that measures nothing', async () => {
    // given
    renderViewer(
      same,
      undefined,
      true,
      vi.fn(() => Promise.resolve([review(101, 'why?')])),
    );
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    // when
    resize.value();
    // then
    expect(zone.heightInPx).toBe(120);
    expect(monaco.zones.layoutZone).not.toHaveBeenCalled();
  });

  test('stops watching zone sizes on unmount', async () => {
    // given
    const view = renderViewer(
      same,
      undefined,
      true,
      vi.fn(() => Promise.resolve([review(101, 'why?')])),
    );
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    // when
    view.unmount();
    // then
    expect(disconnect).toHaveBeenCalled();
  });

  test('adds no zones side by side', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    const comments = vi.fn(() => Promise.resolve([review(101, 'why?')]));
    // when
    renderViewer(changed, undefined, true, comments);
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId('diff-editor')).toHaveAttribute('data-mounted', 'true');
      expect(comments).toHaveBeenCalled();
    });
    expect(monaco.zones.addZone).not.toHaveBeenCalled();
  });

  test('lifts each zone above the editor text so its Reply box takes clicks', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([review(101, 'why?')]));
    // when
    renderViewer(same, undefined, true, comments);
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    expect(Number(zone.domNode.style.zIndex)).toBeGreaterThan(0);
  });

  test.each(['idle', 'ready', 'waiting'] as const)(
    're-reads the review comments when the session turns %s',
    async (dot) => {
      // given
      const comments = vi.fn(() => Promise.resolve([]));
      renderViewer(same, undefined, true, comments);
      await vi.waitFor(() => {
        expect(comments).toHaveBeenCalledTimes(1);
      });
      // when
      act(() => {
        useMaple.setState({
          statuses: { t1: { tabId: 't1', dot, sessionAlive: true, exitCode: null, resumeFailed: false } },
        });
      });
      // then
      await vi.waitFor(() => {
        expect(comments).toHaveBeenCalledTimes(2);
      });
    },
  );

  test('keeps keys typed in a reply from reaching the editor', async () => {
    // given
    renderViewer(
      same,
      undefined,
      true,
      vi.fn(() => Promise.resolve([review(101, 'why?')])),
    );
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const box = await within(zone.domNode).findByRole('textbox', { name: 'Reply' });
    const outer = document.createElement('div');
    outer.appendChild(zone.domNode);
    const reached = vi.fn();
    outer.addEventListener('keydown', reached);
    // when
    fireEvent.keyDown(box, { key: 'a' });
    // then
    expect(reached).not.toHaveBeenCalled();
  });

  test('reads no review comments without an open PR', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    // when
    renderViewer(changed, undefined, false, comments);
    // then
    await screen.findByTestId('editor');
    expect(comments).not.toHaveBeenCalled();
  });

  test('shows the file without comment threads when the review comments fail to load', async () => {
    // given
    const comments = vi.fn(() => Promise.reject(new Error('listing review comments: offline')));
    // when
    renderViewer(same, undefined, true, comments);
    // then
    await vi.waitFor(() => {
      expect(screen.getByTestId('editor')).toHaveAttribute('data-mounted', 'true');
    });
    expect(comments).toHaveBeenCalled();
    expect(monaco.zones.addZone).not.toHaveBeenCalled();
  });

  test('re-reads the PR diff when another file opens', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {}, unpushed: [] }));
    const { props, rerender } = renderViewer(changed, undefined, true, undefined, diffLines);
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(1);
    });
    // when
    rerender(<FileViewer {...props} activeFile="README.md" />);
    // then
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(2);
    });
  });

  test('re-reads the review comments and the PR diff after posting one', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] }, unpushed: [] }));
    renderViewer(changed, undefined, true, comments, diffLines);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAttribute('title');
    });
    await userEvent.click(button);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'why?');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    await vi.waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
      expect(diffLines).toHaveBeenCalledTimes(2);
    });
    expect(diffLines).toHaveBeenCalledWith('t1');
    expect(screen.queryByRole('heading', { name: 'Comment on src/a.ts:3' })).not.toBeInTheDocument();
  });

  test('shows a dot on every open file with a draft', async () => {
    // given
    useMaple.getState().setDraft('t1', 'README.md', { text: 'x\n', disk: 'y\n' });
    // when
    renderViewer(changed);
    // then
    expect(await screen.findByRole('tab', { name: '● README.md' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'a.ts' })).toBeInTheDocument();
  });
});
