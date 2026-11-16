import type { Trace } from '@shared/types/learning/trace';
import { render, screen, waitFor } from '@testing-library/react';
import { monaco } from '@renderer/testing/fakeMonaco';
import { TraceView } from './TraceView';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));
vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

const TRACE: Trace = {
  lang: 'typescript',
  code: 'const a = 1\nconst b = a\nrun(b)\n',
  steps: [
    { lines: [1, 1], text: 'First **bold** <b>tag</b>.' },
    { lines: [2, 3], text: 'Second.' },
  ],
};

function highlighted(call: number): unknown {
  const calls: readonly (readonly unknown[])[] = monaco.editor.createDecorationsCollection.mock.calls;
  return calls.at(call)?.at(0);
}

describe('TraceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('highlights the given step lines', async () => {
    // given
    const trace = TRACE;
    // when
    render(<TraceView trace={trace} step={0} />);
    // then
    await waitFor(() => {
      expect(highlighted(-1)).toEqual([
        {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          options: { isWholeLine: true, className: 'trace-step' },
        },
      ]);
    });
    expect(monaco.editor.revealLineInCenter).toHaveBeenLastCalledWith(1);
    const editor = screen.getByTestId('editor');
    expect(editor).toHaveAttribute('data-value', TRACE.code);
    expect(editor).toHaveAttribute('data-language', 'typescript');
    expect(editor).toHaveAttribute('data-readonly', 'true');
    expect(editor).toHaveAttribute('data-minimap', JSON.stringify({ enabled: false }));
  });

  test('a new step moves the highlight and the step text, with no buttons of its own', async () => {
    // given
    const { rerender } = render(<TraceView trace={TRACE} step={0} />);
    await waitFor(() => {
      expect(monaco.editor.revealLineInCenter).toHaveBeenCalled();
    });
    // when
    rerender(<TraceView trace={TRACE} step={1} />);
    // then
    expect(screen.getByText('Code step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Second.')).toBeInTheDocument();
    expect(highlighted(-1)).toEqual([
      expect.objectContaining({ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 1 } }),
    ]);
    expect(monaco.editor.revealLineInCenter).toHaveBeenLastCalledWith(2);
    expect(monaco.collection.clear).toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('with no step, lists every step by its lines and highlights none', async () => {
    // given
    const trace = TRACE;
    // when
    render(<TraceView trace={trace} step={null} />);
    // then
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual(['Line 1: First **bold** <b>tag</b>.', 'Lines 2–3: Second.']);
    await waitFor(() => {
      expect(screen.getByTestId('editor')).toBeInTheDocument();
    });
    expect(monaco.editor.createDecorationsCollection).not.toHaveBeenCalled();
    expect(screen.queryByText(/Code step/)).not.toBeInTheDocument();
  });

  test('shows step text with Markdown and HTML as plain text', () => {
    // given
    const trace = TRACE;
    // when
    render(<TraceView trace={trace} step={0} />);
    // then
    expect(screen.getByText('First **bold** <b>tag</b>.')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});
