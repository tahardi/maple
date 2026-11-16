import type { ReviewComment } from '@shared/types/github/reviewComment';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LineComments } from './LineComments';
import { threadsByFile } from './threadsByFile';

const comment = (fields: Partial<ReviewComment> & Pick<ReviewComment, 'id'>): ReviewComment => ({
  replyTo: null,
  startLine: null,
  path: 'src/a.ts',
  line: 1,
  author: 'tahardi',
  body: 'why?',
  threadId: null,
  resolved: false,
  ...fields,
});

const first = comment({ id: 1 });
const reply = comment({ id: 2, replyTo: 1, author: 'claude', body: 'because' });

describe('LineComments', () => {
  test('lists each open thread under its file with line, author, first lines, and reply count', () => {
    // given
    const threads = threadsByFile([first, reply]);
    // when
    render(<LineComments threads={threads} onOpen={vi.fn()} />);
    // then
    expect(screen.getByRole('heading', { name: 'src/a.ts' })).toBeInTheDocument();
    const entry = screen.getByRole('button', { name: /Line 1/ });
    expect(entry).toHaveTextContent('tahardi');
    expect(entry).toHaveTextContent('why?');
    expect(entry).toHaveTextContent('1 reply');
  });

  test('folds resolved threads into a closed Resolved group', () => {
    // given
    const threads = threadsByFile([first, comment({ id: 3, line: 4, resolved: true })]);
    // when
    render(<LineComments threads={threads} onOpen={vi.fn()} />);
    // then
    const summary = screen.getByText('Resolved (1)');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')).not.toHaveAttribute('open');
  });

  test('opens the file at the thread line on click', async () => {
    // given
    const onOpen = vi.fn();
    render(<LineComments threads={threadsByFile([first])} onOpen={onOpen} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: /Line 1/ }));
    // then
    expect(onOpen).toHaveBeenCalledWith('src/a.ts', 1);
  });

  test('shows a note when there are no line comments', () => {
    // given
    const threads = threadsByFile([]);
    // when
    render(<LineComments threads={threads} onOpen={vi.fn()} />);
    // then
    expect(screen.getByText('No line comments')).toBeInTheDocument();
  });
});
