import type { MapleApi } from '@shared/api/mapleApi';
import type { DiffLines } from '@shared/types/files/diffLines';
import type { FilePair } from '@shared/types/files/filePair';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFileComments } from '@renderer/card/comments/useFileComments';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { monaco } from '@renderer/testing/fakeMonaco';
import css from '../FileViewer.module.css?raw';
import { CodeView } from './CodeView';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));

vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

let slot: HTMLDivElement;

function Harness({
  tabId,
  path,
  line,
  canComment,
  prFetchedAt,
  review = null,
  onPin,
  onReloadReview,
}: {
  tabId: string;
  path: string;
  line: number | null;
  canComment: boolean;
  prFetchedAt: string | null;
  review?: Review | null;
  onPin?: (path: string) => void;
  onReloadReview?: () => void;
}) {
  const { comments, diff, refresh } = useFileComments({ tabId, canComment, review, activeFile: path, prFetchedAt });
  return (
    <CodeView
      tabId={tabId}
      path={path}
      line={line}
      canComment={canComment}
      review={review}
      comments={comments}
      diff={diff}
      onCommentsChanged={refresh}
      onPin={onPin}
      onReloadReview={onReloadReview}
      toolbar={slot}
    />
  );
}

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

const reviewed: Review = {
  number: 7,
  headSha: 'a'.repeat(40),
  baseSha: 'c'.repeat(40),
  added: 0,
  removed: 0,
  files: [{ path: 'src/a.ts', status: 'M', oldPath: null, stamp: 'f'.repeat(40) }],
  findings: [],
};

function renderViewer(
  pair: FilePair,
  writeFile = vi.fn(() => Promise.resolve()),
  canComment = false,
  comments = vi.fn(() => Promise.resolve<ReviewComment[]>([])),
  diffLines: MapleApi['pr']['diffLines'] = vi.fn(() =>
    Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }),
  ),
) {
  const maple = fakeMaple({
    repo: { readFile: () => Promise.resolve(pair), writeFile },
    pr: { comments, diffLines, readFile: () => Promise.resolve(pair) },
  });
  const props = {
    tabId: 't1',
    path: pair.path,
    line: null,
    canComment,
    prFetchedAt: null,
    review: canComment ? reviewed : null,
    onPin: vi.fn(),
  };
  return { maple, props, ...render(<Harness {...props} />) };
}

function renderFileSwitch(next: () => Promise<FilePair>, canComment = false) {
  const readFile = (_tabId: string, path: string) => (path === 'README.md' ? next() : Promise.resolve(changed));
  fakeMaple({
    repo: { readFile },
    pr: { readFile, diffLines: () => Promise.resolve({ ranges: { 'src/a.ts': [[1, 10]] } }) },
  });
  const props = {
    tabId: 't1',
    line: null,
    canComment,
    prFetchedAt: null,
    review: canComment ? reviewed : null,
  };
  const { rerender } = render(<Harness {...props} path="src/a.ts" />);
  return {
    openNext: () => {
      rerender(<Harness {...props} path="README.md" />);
    },
  };
}

function draftPaths(): string[] {
  const { drafts } = useMaple.getState();
  return Object.hasOwn(drafts, 't1') ? Object.keys(drafts.t1) : [];
}

describe('CodeView', () => {
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
    resize.value = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver(cb: () => void) {
        let live = true;
        const earlier = resize.value;
        resize.value = () => {
          earlier();
          if (live) {
            cb();
          }
        };
        return {
          observe: vi.fn(),
          disconnect: () => {
            live = false;
            disconnect();
          },
        };
      }),
    );
  });

  afterEach(() => {
    slot.remove();
    vi.unstubAllGlobals();
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

  test('hides the diff layout for an unchanged file', async () => {
    // given
    // when
    renderViewer(same);
    await screen.findByTestId('editor');
    // then
    expect(screen.queryByRole('group', { name: 'Diff layout' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Side by side' })).not.toBeInTheDocument();
  });

  test.each<{ name: string; mode: string; pair: FilePair }>([
    { name: 'a deleted file', mode: 'in-file', pair: { kind: 'text', path: 'a.ts', current: null, base: 'old\n' } },
    { name: 'an unchanged file with side by side saved', mode: 'side-by-side', pair: same },
  ])('hides the diff layout for $name', async ({ mode, pair }) => {
    // given
    localStorage.setItem('maple.viewMode', mode);
    // when
    renderViewer(pair);
    await screen.findByTestId('editor');
    // then
    expect(screen.queryByRole('group', { name: 'Diff layout' })).not.toBeInTheDocument();
  });

  test('keeps Comment on an unchanged file with no diff layout', async () => {
    // given
    // when
    renderViewer(same, undefined, true);
    // then
    expect(await screen.findByRole('button', { name: 'Comment' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Diff layout' })).not.toBeInTheDocument();
  });

  test('groups In file and Side by side for a changed file', async () => {
    // given
    // when
    renderViewer(changed);
    await screen.findByTestId('editor');
    // then
    const group = within(screen.getByRole('group', { name: 'Diff layout' }));
    expect(group.getByRole('button', { name: 'In file' })).toBeInTheDocument();
    expect(group.getByRole('button', { name: 'Side by side' })).toBeInTheDocument();
  });

  test('keeps the diff layout while the next file loads', async () => {
    // given
    const { openNext } = renderFileSwitch(() => new Promise<FilePair>(() => undefined));
    await screen.findByRole('group', { name: 'Diff layout' });
    // when
    openNext();
    await act(() => Promise.resolve());
    // then
    expect(screen.getByRole('group', { name: 'Diff layout' })).toBeInTheDocument();
  });

  test('drops the diff layout once the next file loads unchanged', async () => {
    // given
    const { openNext } = renderFileSwitch(() => Promise.resolve({ ...same, path: 'README.md' }));
    await screen.findByRole('group', { name: 'Diff layout' });
    // when
    openNext();
    // then
    await vi.waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Diff layout' })).not.toBeInTheDocument();
    });
  });

  test('drops the held controls when the next file cannot be read', async () => {
    // given
    const { openNext } = renderFileSwitch(() => Promise.reject(new Error('reading file: offline')), true);
    await screen.findByRole('button', { name: 'Comment' });
    // when
    openNext();
    await screen.findByRole('alert');
    // then
    expect(screen.queryByRole('group', { name: 'Diff layout' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument();
  });

  test('keeps Comment in place and disabled while the next file loads', async () => {
    // given
    const { openNext } = renderFileSwitch(() => new Promise<FilePair>(() => undefined), true);
    expect(await screen.findByRole('button', { name: 'Comment' })).toBeEnabled();
    // when
    openNext();
    await act(() => Promise.resolve());
    // then
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  test('does not show Comment while the next file loads from side by side', async () => {
    // given
    localStorage.setItem('maple.viewMode', 'side-by-side');
    const { openNext } = renderFileSwitch(() => new Promise<FilePair>(() => undefined), true);
    await screen.findByTestId('diff-editor');
    // when
    openNext();
    await act(() => Promise.resolve());
    // then
    expect(screen.getByRole('group', { name: 'Diff layout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument();
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

  test('a file message is padded muted text with its own rule', () => {
    // given
    const source = css;
    // when
    const rule = /(^|\n)\.message \{([^}]*)\}/.exec(source)?.[2] ?? '';
    // then
    expect(rule).toContain('padding: var(--space-3)');
    expect(rule).toContain('color: var(--text-muted)');
    expect(rule).not.toContain('background');
    expect(source).not.toMatch(/\.message\s*,/);
  });

  test('shows the base text under a notice for a deleted file', async () => {
    // given
    // when
    renderViewer({ kind: 'text', path: 'src/old.ts', current: null, base: 'old\n' });
    // then
    expect(await screen.findByText('Deleted in this branch')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'old\n');
  });

  test('a file deleted in this branch shows an info notice', async () => {
    // given
    // when
    renderViewer({ kind: 'text', path: 'src/old.ts', current: null, base: 'old\n' });
    // then
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Deleted in this branch');
    expect(notice).toHaveAttribute('data-tone', 'info');
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
    render(<Harness tabId="t1" path="a.ts" line={null} canComment={false} prFetchedAt={null} />);
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
            overviewRuler: { color: '#4fa3e0', position: 7 },
            minimap: { color: '#4fa3e0', position: 2 },
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
      line: null,
      canComment: false,
      prFetchedAt: null,
    };
    const { rerender } = render(<Harness {...props} path="a.ts" />);
    rerender(<Harness {...props} path="b.ts" />);
    await screen.findByTestId('editor');
    // when
    await act(async () => {
      finishFirst({ kind: 'text', path: 'a.ts', current: 'a\n', base: 'a\n' });
      await Promise.resolve();
    });
    // then
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'b\n');
  });

  test('a hidden tab reads the file once and skips repo changes', async () => {
    // given
    useMaple.setState({ activeTabId: 'other' });
    const readFile = vi.fn(() => Promise.resolve(changed));
    const onChanged = vi.fn(() => vi.fn());
    fakeMaple({ repo: { readFile, onChanged } });
    // when
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment={false} prFetchedAt={null} />);
    await screen.findByTestId('editor');
    // then
    expect(readFile).toHaveBeenCalledOnce();
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('a hidden tab re-reads the file and listens again when shown', async () => {
    // given
    useMaple.setState({ activeTabId: 'other' });
    const readFile = vi.fn(() => Promise.resolve(changed));
    const onChanged = vi.fn(() => vi.fn());
    fakeMaple({ repo: { readFile, onChanged } });
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment={false} prFetchedAt={null} />);
    await screen.findByTestId('editor');
    // when
    act(() => {
      useMaple.setState({ activeTabId: 't1' });
    });
    // then
    await waitFor(() => {
      expect(readFile).toHaveBeenCalledTimes(2);
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  test('a tab that is hidden stops listening for repo changes', async () => {
    // given
    const stop = vi.fn();
    fakeMaple({ repo: { readFile: () => Promise.resolve(changed), onChanged: () => stop } });
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment={false} prFetchedAt={null} />);
    await screen.findByTestId('editor');
    // when
    act(() => {
      useMaple.setState({ activeTabId: 'other' });
    });
    // then
    expect(stop).toHaveBeenCalledOnce();
  });

  test('stops listening for repo changes on unmount', async () => {
    // given
    const stop = vi.fn();
    fakeMaple({ repo: { onChanged: () => stop } });
    const { unmount } = render(<Harness tabId="t1" path="a.png" line={null} canComment={false} prFetchedAt={null} />);
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
    render(<Harness tabId="t1" path="src/a.ts" line={3} canComment={false} prFetchedAt={null} />);
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
      canComment: false,
      prFetchedAt: null,
    };
    const { rerender } = render(<Harness {...props} path="a.ts" line={null} />);
    await screen.findByTestId('editor');
    monaco.slowMount.value = true;
    // when
    rerender(<Harness {...props} path="b.ts" line={5} />);
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
    render(<Harness tabId="t1" path="a.ts" line={null} canComment={false} prFetchedAt={null} />);
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

  test('reads a file from GitHub at the review commits and shows it read-only', async () => {
    // given
    const pinned: Review = {
      number: 7,
      headSha: 'a'.repeat(40),
      baseSha: 'c'.repeat(40),
      added: 0,
      removed: 0,
      files: [{ path: 'src/a.ts', status: 'R', oldPath: 'src/old.ts', stamp: 'f'.repeat(40) }],
      findings: [],
    };
    const prRead = vi.fn(() => Promise.resolve(changed));
    const repoRead = vi.fn(() => Promise.resolve(changed));
    fakeMaple({ repo: { readFile: repoRead }, pr: { readFile: prRead } });
    // when
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment={false} prFetchedAt={null} review={pinned} />);
    // then
    const editor = await screen.findByTestId('editor');
    expect(prRead).toHaveBeenCalledWith('t1', 'src/a.ts', 'src/old.ts', pinned.baseSha, pinned.headSha);
    expect(repoRead).not.toHaveBeenCalled();
    expect(editor).toHaveAttribute('data-readonly', 'true');
    expect(editor).toHaveAttribute('data-value', 'new\n');
  });

  test('a review file is not read again when the tab is hidden and shown', async () => {
    // given
    const pinned: Review = {
      number: 7,
      headSha: 'a'.repeat(40),
      baseSha: 'c'.repeat(40),
      added: 0,
      removed: 0,
      files: [{ path: 'src/a.ts', status: 'M', oldPath: null, stamp: 'f'.repeat(40) }],
      findings: [],
    };
    const prRead = vi.fn(() => Promise.resolve(changed));
    fakeMaple({ pr: { readFile: prRead } });
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment={false} prFetchedAt={null} review={pinned} />);
    await screen.findByTestId('editor');
    // when
    act(() => {
      useMaple.setState({ activeTabId: 'other' });
    });
    act(() => {
      useMaple.setState({ activeTabId: 't1' });
    });
    // then
    expect(prRead).toHaveBeenCalledOnce();
  });

  test('shows why a file from GitHub could not be read', async () => {
    // given
    const pinned: Review = {
      number: 7,
      headSha: 'a'.repeat(40),
      baseSha: 'c'.repeat(40),
      added: 0,
      removed: 0,
      files: [],
      findings: [],
    };
    fakeMaple({
      pr: { readFile: vi.fn(() => Promise.reject(new Error("Error invoking remote method 'pr:readFile': Error: x"))) },
    });
    // when
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment={false} prFetchedAt={null} review={pinned} />);
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Reading the file from GitHub failed: x$/);
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
    expect(draftPaths()).toEqual(['a.ts']);
    // when
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    // then
    await vi.waitFor(() => {
      expect(draftPaths()).toEqual([]);
    });
    expect(writeFile).toHaveBeenCalledWith('t1', 'a.ts', 'two\n');
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
  });

  test('typing in a file pins its tab', async () => {
    // given
    const { props } = renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    // when
    act(() => {
      monaco.change.value('two\n');
    });
    // then
    expect(props.onPin).toHaveBeenCalledWith('a.ts');
  });

  test('a value set by the editor wrapper pins nothing and writes no draft', async () => {
    // given
    const { props } = renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    // when
    act(() => {
      monaco.change.value('old\n', true);
    });
    // then
    expect(props.onPin).not.toHaveBeenCalled();
    expect(draftPaths()).toEqual([]);
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
    expect(draftPaths()).toEqual(['a.ts']);
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
    render(<Harness tabId="t1" path="a.ts" line={null} canComment={false} prFetchedAt={null} />);
    await screen.findByTestId('editor');
    act(() => {
      monaco.change.value('two\n');
    });
    // when
    current = 'three\n';
    changedCb();
    // then
    expect((await screen.findByText('File changed on disk')).closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warning',
    );
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    // then
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'three\n');
    expect(screen.queryByText('File changed on disk')).not.toBeInTheDocument();
    expect(draftPaths()).toEqual([]);
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
    expect(draftPaths()).toEqual([]);
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
      line: null,
      canComment: false,
      prFetchedAt: null,
    };
    const { rerender } = render(<Harness {...props} path="a.ts" />);
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
    expect(draftPaths()).toEqual(['a.ts']);
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'two\n');
    expect(screen.getByRole('alert')).toHaveTextContent('Saving failed: writing file: disk full');
    // when
    rerender(<Harness {...props} path="b.ts" />);
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

  test('Comment opens the line comment form in a zone under the cursor line', async () => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    // when
    await userEvent.click(button);
    // then
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    expect(zone.afterLineNumber).toBe(3);
    expect(Number(zone.domNode.style.zIndex)).toBeGreaterThan(0);
    expect(zone.suppressMouseDown).not.toBe(true);
    within(zone.domNode).getByRole('heading', { name: 'Comment on src/a.ts:3' });
    expect(screen.queryByRole('heading', { name: /^Comment on / })).not.toBeInTheDocument();
  });

  test('Comment puts the cursor in the new comment box once the editor shows it', async () => {
    // given
    monaco.zones.addZone.mockImplementationOnce((zone) => {
      document.body.appendChild(zone.domNode);
      onTestFinished(() => {
        zone.domNode.remove();
      });
      return 'z1';
    });
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const box = within(zone.domNode).getByRole('textbox');
    const content = zone.domNode.firstElementChild;
    if (!(content instanceof HTMLElement)) {
      throw new Error('finding zone content');
    }
    act(() => {
      resize.value();
    });
    expect(box).not.toHaveFocus();
    vi.spyOn(content, 'offsetHeight', 'get').mockReturnValue(120);
    // when
    act(() => {
      resize.value();
    });
    // then
    expect(box).toHaveFocus();
  });

  test('leaves the cursor where it is when the file reloads under an open form', async () => {
    // given
    const readFile = vi.fn(() => Promise.resolve<FilePair>({ ...changed }));
    fakeMaple({
      pr: { readFile, diffLines: () => Promise.resolve({ ranges: { 'src/a.ts': [[1, 10]] } }) },
    });
    const props = {
      tabId: 't1',
      path: 'src/a.ts',
      line: null,
      canComment: true,
      prFetchedAt: null,
      review: reviewed,
    };
    const { rerender } = render(<Harness {...props} />);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const box = within(zone.domNode).getByRole('textbox');
    const focus = vi.spyOn(box, 'focus');
    // when
    rerender(<Harness {...props} review={{ ...reviewed, headSha: 'b'.repeat(40) }} />);
    // then
    await vi.waitFor(() => {
      expect(readFile).toHaveBeenCalledTimes(2);
    });
    await act(() => Promise.resolve());
    expect(focus).not.toHaveBeenCalled();
  });

  test('Cancel removes the new comment zone without posting', async () => {
    // given
    renderViewer(changed, undefined, true);
    const comment = vi.spyOn(window.maple.pr, 'comment');
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    // when
    fireEvent.click(within(zone.domNode).getByRole('button', { name: 'Cancel' }));
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
    });
    expect(comment).not.toHaveBeenCalled();
  });

  test('keeps keys typed in a new comment from reaching the editor', async () => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const box = within(zone.domNode).getByRole('textbox');
    const outer = document.createElement('div');
    outer.appendChild(zone.domNode);
    const reached = vi.fn();
    outer.addEventListener('keydown', reached);
    // when
    fireEvent.keyDown(box, { key: 'a' });
    // then
    expect(reached).not.toHaveBeenCalled();
  });

  test('opens the form under a thread on the same line without replacing it', async () => {
    // given
    monaco.zones.addZone.mockReturnValueOnce('z1').mockReturnValueOnce('z2');
    renderViewer(
      changed,
      undefined,
      true,
      vi.fn(() => Promise.resolve([review(101, 'why?')])),
    );
    await vi.waitFor(() => {
      expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    });
    const button = screen.getByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    // when
    await userEvent.click(button);
    // then
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(2);
    const [thread] = monaco.zones.addZone.mock.calls[0];
    const [form] = monaco.zones.addZone.mock.calls[1];
    expect(thread.afterLineNumber).toBe(3);
    expect(form.afterLineNumber).toBe(3);
    within(form.domNode).getByRole('heading', { name: 'Comment on src/a.ts:3' });
    expect(thread.domNode).toHaveTextContent('why?');
    expect(monaco.zones.removeZone).not.toHaveBeenCalled();
  });

  test('moves the form to the last line of a new selection', async () => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    await moveCursor(select(5, 6));
    // when
    await userEvent.click(button);
    // then
    expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(2);
    const [zone] = monaco.zones.addZone.mock.calls[1];
    expect(zone.afterLineNumber).toBe(6);
    within(zone.domNode).getByRole('heading', { name: 'Comment on src/a.ts:5-6' });
  });

  test('keeps the form zone and shows the error when posting fails', async () => {
    // given
    renderViewer(changed, undefined, true);
    vi.spyOn(window.maple.pr, 'comment').mockRejectedValue(new Error('posting review comment: offline'));
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const form = within(zone.domNode);
    // when
    fireEvent.change(form.getByRole('textbox'), { target: { value: 'why?' } });
    fireEvent.click(form.getByRole('button', { name: 'Post' }));
    // then
    expect(await form.findByRole('alert')).toHaveTextContent('posting review comment: offline');
    expect(monaco.zones.removeZone).not.toHaveBeenCalled();
  });

  test('removes the form zone when another file opens', async () => {
    // given
    const { props, rerender } = renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    // when
    rerender(<Harness {...props} path="README.md" />);
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
    });
  });

  test('removes the form zone when switching to side by side', async () => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
    });
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
      pr: {
        comment,
        readFile: () => Promise.resolve(changed),
        diffLines: () => Promise.resolve({ ranges: { 'src/a.ts': [[1, 10]] } }),
      },
    });
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment prFetchedAt={null} review={reviewed} />);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await moveCursor(select(2, end, endColumn));
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    // when
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    expect(zone.afterLineNumber).toBe(4);
    const form = within(zone.domNode);
    form.getByRole('heading', { name: want });
    fireEvent.change(form.getByRole('textbox'), { target: { value: 'why?' } });
    fireEvent.click(form.getByRole('button', { name: 'Post' }));
    // then
    expect(comment).toHaveBeenCalledWith('t1', 'src/a.ts', 2, 4, 'why?', reviewed.headSha);
  });

  test('Comment is disabled until lines are selected', async () => {
    // given
    monaco.editor.getSelection.mockReturnValue({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    onTestFinished(() => {
      monaco.editor.getSelection.mockReset();
    });
    // when
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    // then
    await vi.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAccessibleDescription('Select lines to comment on');
    expect(screen.getByText('Select lines to comment on')).toHaveAttribute('data-kind', 'hint');
    // when
    await moveCursor(select(3, 3));
    // then
    expect(button).toBeEnabled();
  });

  test('Comment is disabled again when the cursor returns to the start of the file', async () => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await moveCursor(select(3, 3));
    // when
    await moveCursor(select(1, 1, 1));
    // then
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Select lines to comment on');
    expect(screen.getByText('Select lines to comment on')).toHaveAttribute('data-kind', 'hint');
  });

  test.each([
    { name: 'text selected on the first line', selection: select(1, 1, 4).selection },
    {
      name: 'a cursor partway along the first line',
      selection: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 },
    },
  ])('Comment is enabled for $name', async ({ selection }) => {
    // given
    renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    // when
    await moveCursor({ selection });
    // then
    expect(button).toBeEnabled();
  });

  test.each([
    {
      name: 'the no-review reason once lines are selected',
      cursor: select(3, 3),
      want: 'Review not loaded',
      kind: null,
    },
    {
      name: 'the selection hint before lines are selected',
      cursor: select(1, 1, 1),
      want: 'Select lines to comment on',
      kind: 'hint',
    },
  ])('Comment without a loaded review shows $name', async ({ cursor, want, kind }) => {
    // given
    const { props, rerender } = renderViewer(changed, undefined, true);
    await screen.findByRole('button', { name: 'Comment' });
    rerender(<Harness {...props} review={null} />);
    // when
    await moveCursor(cursor);
    // then
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAccessibleDescription(want);
    expect(screen.getByText(want).getAttribute('data-kind')).toBe(kind);
  });

  test('shows why Comment is blocked beside the button before it is clicked', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }));
    renderViewer(changed, undefined, true, undefined, diffLines);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalled();
    });
    // when
    await moveCursor(select(8, 12));
    // then
    const reason = 'GitHub only accepts comments on lines in the PR diff';
    expect(screen.getByText(reason)).toBeVisible();
    expect(button).toHaveAccessibleDescription(reason);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('explains why Comment does nothing on lines that leave the PR diff', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }));
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
      lines: { ranges: { 'src/a.ts': [[1, 10]] } },
      cursor: 20,
      reason: 'GitHub only accepts comments on lines in the PR diff',
    },
    {
      name: 'in a file the PR does not change',
      lines: { ranges: { 'README.md': [[1, 10]] } },
      cursor: 3,
      reason: 'GitHub only accepts comments on lines in the PR diff',
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
    expect(monaco.zones.addZone).not.toHaveBeenCalled();
  });

  test('drops the explanation and opens the form once the cursor moves into the PR diff', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }));
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
    const [zone] = monaco.zones.addZone.mock.calls[0];
    expect(zone.afterLineNumber).toBe(10);
    within(zone.domNode).getByRole('heading', { name: 'Comment on src/a.ts:10' });
  });

  test('reads the diff ranges at the review commits', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {} }));
    // when
    renderViewer(changed, undefined, true, undefined, diffLines);
    // then
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledWith('t1', reviewed.baseSha, reviewed.headSha);
    });
  });

  test('asks for the ranges again after the review reloads', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {} }));
    const { props, rerender } = renderViewer(changed, undefined, true, undefined, diffLines);
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(1);
    });
    const next = { ...reviewed, headSha: 'b'.repeat(40) };
    // when
    rerender(<Harness {...props} review={next} />);
    // then
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledWith('t1', reviewed.baseSha, next.headSha);
    });
  });

  test('keeps Comment refused until the ranges for the new review arrive', async () => {
    // given
    const next = { ...reviewed, headSha: 'b'.repeat(40) };
    const diffLines = vi.fn((_tabId: string, _base: string, head: string) =>
      head === reviewed.headSha
        ? Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } })
        : new Promise<DiffLines>(() => undefined),
    );
    const { props, rerender } = renderViewer(changed, undefined, true, undefined, diffLines);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    // when
    rerender(<Harness {...props} review={next} />);
    // then
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledWith('t1', reviewed.baseSha, next.headSha);
    });
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAccessibleDescription(
      'GitHub only accepts comments on lines in the PR diff',
    );
  });

  test('removes the form zone when the review goes away', async () => {
    // given
    const { props, rerender } = renderViewer(changed, undefined, true);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    expect(monaco.zones.addZone).toHaveBeenCalledTimes(1);
    // when
    rerender(<Harness {...props} review={null} />);
    // then
    await vi.waitFor(() => {
      expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
    });
  });

  test('offers Reload review beside Comment without a loaded review', async () => {
    // given
    const onReloadReview = vi.fn();
    fakeMaple({ repo: { readFile: () => Promise.resolve(changed) } });
    render(
      <Harness
        tabId="t1"
        path="src/a.ts"
        line={null}
        canComment
        prFetchedAt={null}
        review={null}
        onReloadReview={onReloadReview}
      />,
    );
    await screen.findByRole('button', { name: 'Comment' });
    await moveCursor(select(3, 3));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload review' }));
    // then
    expect(onReloadReview).toHaveBeenCalledOnce();
  });

  test('explains why Comment does nothing without a loaded review', async () => {
    // given
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }));
    fakeMaple({ repo: { readFile: () => Promise.resolve(changed) }, pr: { diffLines } });
    render(<Harness tabId="t1" path="src/a.ts" line={null} canComment prFetchedAt={null} review={null} />);
    await screen.findByRole('button', { name: 'Comment' });
    await moveCursor(select(3, 3));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't comment on line 3. Review not loaded");
    expect(diffLines).not.toHaveBeenCalled();
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
        view.rerender(<Harness {...view.props} path="README.md" />);
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
    rerender(<Harness {...props} prFetchedAt="2026-10-22T12:00:00.000Z" />);
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
    rerender(<Harness {...props} prFetchedAt="2026-10-22T12:00:00.000Z" />);
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
    rerender(<Harness {...props} prFetchedAt="2026-10-22T12:00:00.000Z" />);
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
          statuses: { t1: { tabId: 't1', dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null } },
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
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: {} }));
    const { props, rerender } = renderViewer(changed, undefined, true, undefined, diffLines);
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(1);
    });
    // when
    rerender(<Harness {...props} path="README.md" />);
    // then
    await vi.waitFor(() => {
      expect(diffLines).toHaveBeenCalledTimes(2);
    });
  });

  test('re-reads the review comments and the PR diff after posting one', async () => {
    // given
    const comments = vi.fn(() => Promise.resolve([]));
    const diffLines = vi.fn(() => Promise.resolve<DiffLines>({ ranges: { 'src/a.ts': [[1, 10]] } }));
    renderViewer(changed, undefined, true, comments, diffLines);
    const button = await screen.findByRole('button', { name: 'Comment' });
    await vi.waitFor(() => {
      expect(button).not.toHaveAccessibleDescription();
    });
    await userEvent.click(button);
    const [zone] = monaco.zones.addZone.mock.calls[0];
    const form = within(zone.domNode);
    // when
    fireEvent.change(form.getByRole('textbox'), { target: { value: 'why?' } });
    fireEvent.click(form.getByRole('button', { name: 'Post' }));
    // then
    await vi.waitFor(() => {
      expect(comments).toHaveBeenCalledTimes(2);
      expect(diffLines).toHaveBeenCalledTimes(2);
    });
    expect(diffLines).toHaveBeenCalledWith('t1', reviewed.baseSha, reviewed.headSha);
    expect(monaco.zones.removeZone).toHaveBeenCalledWith('z1');
  });

  test('shows no Wrap button and leaves wrapping alone on repo files', async () => {
    // given
    // when
    renderViewer(changed);
    // then
    expect(await screen.findByTestId('editor')).not.toHaveAttribute('data-wrap');
    expect(screen.queryByRole('button', { name: 'Wrap' })).not.toBeInTheDocument();
  });
});
