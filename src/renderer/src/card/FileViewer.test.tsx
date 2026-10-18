import type { FilePair } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { FileViewer } from './FileViewer';

vi.mock('./monacoSetup', () => ({}));

const monaco = vi.hoisted(() => {
  const collection = { clear: vi.fn() };
  const editor = { createDecorationsCollection: vi.fn(() => collection), getScrollTop: () => 0, setScrollTop: vi.fn() };
  const api = {
    editor: { OverviewRulerLane: { Full: 7 } },
    languages: { getLanguages: () => [{ id: 'typescript', extensions: ['.ts'] }] },
  };
  return { editor, collection, api, enabled: { value: false } };
});

vi.mock('@monaco-editor/react', async () => {
  const { useEffect } = await import('react');
  return {
    useMonaco: () => (monaco.enabled.value ? monaco.api : null),
    Editor: (props: {
      value: string;
      language: string | undefined;
      options: { readOnly: boolean };
      onMount: (editor: unknown) => void;
    }) => {
      const { onMount } = props;
      useEffect(() => {
        onMount(monaco.editor);
      }, [onMount]);
      return (
        <div
          data-testid="editor"
          data-value={props.value}
          data-language={props.language}
          data-readonly={String(props.options.readOnly)}
        />
      );
    },
    DiffEditor: (props: { original: string; modified: string; options: { renderSideBySide: boolean } }) => (
      <div
        data-testid="diff-editor"
        data-original={props.original}
        data-modified={props.modified}
        data-side-by-side={String(props.options.renderSideBySide)}
      />
    ),
  };
});

const changed: FilePair = { kind: 'text', path: 'src/a.ts', current: 'new\n', base: 'old\n' };

function renderViewer(pair: FilePair) {
  const maple = fakeMaple({ repo: { readFile: () => Promise.resolve(pair) } });
  const props = {
    tabId: 't1',
    openFiles: [pair.path, 'README.md'],
    activeFile: pair.path,
    onActivate: vi.fn(),
    onCloseFile: vi.fn(),
  };
  return { maple, props, ...render(<FileViewer {...props} />) };
}

describe('FileViewer', () => {
  beforeEach(() => {
    localStorage.clear();
    monaco.enabled.value = false;
    vi.clearAllMocks();
  });

  test('renders a read-only editor in file mode by default', async () => {
    // given
    // when
    renderViewer(changed);
    // then
    const editor = await screen.findByTestId('editor');
    expect(editor).toHaveAttribute('data-value', 'new\n');
    expect(editor).toHaveAttribute('data-readonly', 'true');
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
    render(<FileViewer tabId="t1" openFiles={['a.ts']} activeFile="a.ts" onActivate={vi.fn()} onCloseFile={vi.fn()} />);
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
});
