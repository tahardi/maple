import type { Trace } from '@shared/types/learning/trace';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  test('highlights the first step lines', async () => {
    // given
    const trace = TRACE;
    // when
    render(<TraceView trace={trace} />);
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

  test('Next and Back move the highlight and the step text', async () => {
    // given
    render(<TraceView trace={TRACE} />);
    await waitFor(() => {
      expect(monaco.editor.revealLineInCenter).toHaveBeenCalled();
    });
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    // then
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Second.')).toBeInTheDocument();
    expect(highlighted(-1)).toEqual([
      expect.objectContaining({ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 1 } }),
    ]);
    expect(monaco.editor.revealLineInCenter).toHaveBeenLastCalledWith(2);
    expect(monaco.collection.clear).toHaveBeenCalled();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    // then
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(monaco.editor.revealLineInCenter).toHaveBeenLastCalledWith(1);
  });

  test('Back and Next show their reason at the ends', async () => {
    // given
    render(<TraceView trace={TRACE} />);
    // then
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByText('First step')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    // then
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Last step')).toBeInTheDocument();
    expect(screen.queryByText('First step')).not.toBeInTheDocument();
  });

  test('shows step text with Markdown and HTML as plain text', () => {
    // given
    const trace = TRACE;
    // when
    render(<TraceView trace={trace} />);
    // then
    expect(screen.getByText('First **bold** <b>tag</b>.')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});
