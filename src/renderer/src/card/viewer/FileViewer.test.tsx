import type { MapleApi } from '@shared/api/mapleApi';
import type { DiffLines } from '@shared/types/files/diffLines';
import type { FilePair } from '@shared/types/files/filePair';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { monaco } from '@renderer/testing/fakeMonaco';
import { FileViewer } from './FileViewer';
import { PR_DESCRIPTION } from '@renderer/card/viewer/tabs/prDescription';
import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));

vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

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
    openFiles: [pair.path, 'README.md'],
    activeFile: pair.path,
    onActivate: vi.fn(),
    onCloseFiles: vi.fn(),
    prBody: null,
    line: null,
    canComment,
    prFetchedAt: null,
    review: canComment ? reviewed : null,
    preview: 'README.md',
    onPin: vi.fn(),
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
    useMaple.setState({ activeTabId: 't1' });
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
        onCloseFiles={vi.fn()}
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
    const onCloseFiles = vi.fn();
    fakeMaple();
    render(
      <FileViewer
        tabId="t1"
        openFiles={[path]}
        activeFile={path}
        onActivate={vi.fn()}
        onCloseFiles={onCloseFiles}
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
    expect(onCloseFiles).toHaveBeenCalledWith([path]);
  });

  test.each([
    { name: 'Card description', path: CARD_DESCRIPTION, prBody: null, cardBody: '## Summary' },
    { name: 'PR description', path: PR_DESCRIPTION, prBody: '## Summary', cardBody: undefined },
  ])('shows no overview strip on the $name', ({ path, prBody, cardBody }) => {
    // given
    fakeMaple();
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={[path]}
        activeFile={path}
        onActivate={vi.fn()}
        onCloseFiles={vi.fn()}
        prBody={prBody}
        cardBody={cardBody}
        line={null}
        canComment={false}
        prFetchedAt={null}
      />,
    );
    // then
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.queryByTestId('note-overview')).not.toBeInTheDocument();
  });

  test('shows each description with its own body', () => {
    // given
    fakeMaple();
    const props = {
      tabId: 't1',
      openFiles: [PR_DESCRIPTION, CARD_DESCRIPTION],
      onActivate: vi.fn(),
      onCloseFiles: vi.fn(),
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

  test('activates and closes file tabs', async () => {
    // given
    const { props } = renderViewer(changed);
    await screen.findByTestId('editor');
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'README.md' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close src/a.ts' }));
    // then
    expect(props.onActivate).toHaveBeenCalledWith('README.md');
    expect(props.onCloseFiles).toHaveBeenCalledWith(['src/a.ts']);
    expect(screen.getByRole('tab', { name: 'a.ts', selected: true })).toBeInTheDocument();
  });

  test.each([
    { item: 'Close', closed: ['src/a.ts'] },
    { item: 'Close Others', closed: ['README.md', 'src/b.ts'] },
    { item: 'Close All', closed: ['README.md', 'src/a.ts', 'src/b.ts'] },
  ])('right-clicking a file tab and choosing $item closes $closed', async ({ item, closed }) => {
    // given
    const { props, rerender } = renderViewer(changed);
    rerender(<FileViewer {...props} openFiles={['README.md', 'src/a.ts', 'src/b.ts']} />);
    await screen.findByTestId('editor');
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    await userEvent.click(screen.getByRole('menuitem', { name: item }));
    // then
    expect(props.onCloseFiles).toHaveBeenCalledWith(closed);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('right-clicking the Card description tab offers the same menu', async () => {
    // given
    const onCloseFiles = vi.fn();
    fakeMaple();
    render(
      <FileViewer
        tabId="t1"
        openFiles={[CARD_DESCRIPTION]}
        activeFile={CARD_DESCRIPTION}
        onActivate={vi.fn()}
        onCloseFiles={onCloseFiles}
        prBody={null}
        cardBody="Ship it"
        line={null}
        canComment={false}
        prFetchedAt={null}
      />,
    );
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Card description' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close' }));
    // then
    expect(onCloseFiles).toHaveBeenCalledWith([CARD_DESCRIPTION]);
  });

  test('disables Close Others when one file tab is open', async () => {
    // given
    const { props, rerender } = renderViewer(changed);
    rerender(<FileViewer {...props} openFiles={['src/a.ts']} />);
    await screen.findByTestId('editor');
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    // then
    expect(screen.getByRole('menuitem', { name: 'Close Others' })).toBeDisabled();
  });

  test.each([
    {
      name: 'Escape',
      dismiss: () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      },
    },
    {
      name: 'a click outside',
      dismiss: () => {
        fireEvent.pointerDown(document.body);
      },
    },
  ])('$name removes the file tab menu without closing a tab', async ({ dismiss }) => {
    // given
    const { props } = renderViewer(changed);
    await screen.findByTestId('editor');
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    // when
    dismiss();
    // then
    expect(await screen.findByRole('tab', { name: 'a.ts' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(props.onCloseFiles).not.toHaveBeenCalled();
  });

  test('right-clicking a second file tab moves the menu to it', async () => {
    // given
    const { props } = renderViewer(changed);
    await screen.findByTestId('editor');
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a.ts' }));
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'README.md' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close' }));
    // then
    expect(props.onCloseFiles).toHaveBeenCalledWith(['README.md']);
  });

  test('right-clicking a file tab does not activate it', async () => {
    // given
    const { props } = renderViewer(changed);
    await screen.findByTestId('editor');
    // when
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'README.md' }));
    // then
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  test('shows no file tab menu until a tab is right-clicked', async () => {
    // given
    renderViewer(changed);
    // when
    await screen.findByTestId('editor');
    // then
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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
        onCloseFiles={vi.fn()}
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

  test('shows only the preview tab in italics', async () => {
    // given
    const pair: FilePair = { kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' };
    // when
    renderViewer(pair);
    await screen.findByTestId('editor');
    // then
    expect(screen.getByRole('tab', { name: 'README.md' }).className).toMatch(/preview/);
    expect(screen.getByRole('tab', { name: 'a.ts' }).className).not.toMatch(/preview/);
  });

  test('double-clicking a file tab pins it', async () => {
    // given
    const { props } = renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    // when
    await userEvent.dblClick(screen.getByRole('tab', { name: 'README.md' }));
    // then
    expect(props.onPin).toHaveBeenCalledWith('README.md');
  });

  test('double-clicking a tab close button pins nothing', async () => {
    // given
    const { props } = renderViewer({ kind: 'text', path: 'a.ts', current: 'one\n', base: 'one\n' });
    await screen.findByTestId('editor');
    // when
    await userEvent.dblClick(screen.getByRole('button', { name: 'Close README.md' }));
    // then
    expect(props.onPin).not.toHaveBeenCalled();
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

  test('shows a dot on every open file with a draft', async () => {
    // given
    useMaple.getState().setDraft('t1', 'README.md', { text: 'x\n', disk: 'y\n' });
    // when
    renderViewer(changed);
    // then
    expect(await screen.findByRole('tab', { name: '● README.md' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'a.ts' })).toBeInTheDocument();
  });

  test.each([
    { name: 'a vault note', path: 'vault:Spike.md', button: 'Edit', absent: 'In file' },
    { name: 'a changed code file', path: 'src/a.ts', button: 'In file', absent: 'Edit' },
  ])('shows the buttons of $name in the bar', async ({ path, button, absent }) => {
    // given
    fakeMaple({
      repo: { readFile: () => Promise.resolve(changed) },
      vault: { read: () => Promise.resolve('## Findings\n') },
    });
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={[path]}
        activeFile={path}
        onActivate={vi.fn()}
        onCloseFiles={vi.fn()}
        prBody={null}
        line={null}
        canComment={false}
        prFetchedAt={null}
      />,
    );
    // then
    const bar = screen.getByRole('tablist').parentElement;
    if (bar === null) {
      throw new Error('finding the tab bar');
    }
    expect(await within(bar).findByRole('button', { name: button })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: absent })).not.toBeInTheDocument();
  });

  test('shows no view buttons on a description', () => {
    // given
    fakeMaple();
    // when
    render(
      <FileViewer
        tabId="t1"
        openFiles={[PR_DESCRIPTION]}
        activeFile={PR_DESCRIPTION}
        onActivate={vi.fn()}
        onCloseFiles={vi.fn()}
        prBody="## Summary"
        line={null}
        canComment={false}
        prFetchedAt={null}
      />,
    );
    // then
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In file' })).not.toBeInTheDocument();
  });

  test('switches from a note to a code file', async () => {
    // given
    fakeMaple({
      repo: { readFile: () => Promise.resolve(changed) },
      vault: { read: () => Promise.resolve('## Findings\n') },
    });
    const props = {
      tabId: 't1',
      openFiles: ['vault:Spike.md', 'src/a.ts'],
      onActivate: vi.fn(),
      onCloseFiles: vi.fn(),
      prBody: null,
      line: null,
      canComment: false,
      prFetchedAt: null,
    };
    const { rerender } = render(<FileViewer {...props} activeFile="vault:Spike.md" />);
    await screen.findByRole('heading', { name: 'Findings' });
    // when
    rerender(<FileViewer {...props} activeFile="src/a.ts" />);
    // then
    expect(await screen.findByRole('button', { name: 'In file' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Findings' })).not.toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-value', 'new\n');
  });

  test('file tabs are reachable with Tab and open on Enter', async () => {
    // given
    const { props } = renderViewer(same);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('tab', { name: 'README.md' })).toHaveFocus();
    // when
    await userEvent.keyboard('{Enter}');
    // then
    expect(props.onActivate).toHaveBeenCalledWith('README.md');
  });
});
