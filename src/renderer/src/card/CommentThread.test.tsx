import type { ReviewComment } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { CommentThread } from './CommentThread';
import type { Thread } from './commentThreads';

const comment = (id: number, author: string, body: string, replyTo: number | null = null): ReviewComment => ({
  id,
  replyTo,
  startLine: null,
  path: 'src/a.ts',
  line: 3,
  author,
  body,
});

const thread: Thread = {
  id: 101,
  line: 3,
  startLine: null,
  comments: [comment(101, 'tahardi', 'why **bold**?'), comment(102, 'claude', 'because', 101)],
};

describe('CommentThread', () => {
  test.each([
    { name: 'one line', startLine: null, want: 'Line 3' },
    { name: 'several lines', startLine: 1, want: 'Lines 1-3' },
  ])('labels a thread on $name', ({ startLine, want }) => {
    // given
    fakeMaple();
    // when
    render(<CommentThread tabId="t1" thread={{ ...thread, startLine }} onPosted={vi.fn()} />);
    // then
    expect(screen.getByText(want)).toBeInTheDocument();
  });

  test('shows each comment author and markdown body in order', () => {
    // given
    fakeMaple();
    // when
    const { container } = render(<CommentThread tabId="t1" thread={thread} onPosted={vi.fn()} />);
    // then
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    const authors = screen.getAllByText(/^(tahardi|claude)$/).map((el) => el.textContent);
    expect(authors).toEqual(['tahardi', 'claude']);
    expect(container).toHaveTextContent(/why bold\?.*because/);
  });

  test('posts a reply to the thread and clears the text', async () => {
    // given
    const reply = vi.fn(() => Promise.resolve());
    fakeMaple({ pr: { reply } });
    const onPosted = vi.fn();
    render(<CommentThread tabId="t1" thread={thread} onPosted={onPosted} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), 'thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(reply).toHaveBeenCalledWith('t1', 101, 'thanks');
    expect(onPosted).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('');
  });

  test.each([
    { name: 'empty', text: '' },
    { name: 'blank', text: '   ' },
  ])('disables Post while the text is $name', async ({ text }) => {
    // given
    fakeMaple();
    render(<CommentThread tabId="t1" thread={thread} onPosted={vi.fn()} />);
    // when
    if (text !== '') {
      await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), text);
    }
    // then
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  test('disables Post while a post is in flight', async () => {
    // given
    fakeMaple({ pr: { reply: vi.fn(() => new Promise<void>(() => undefined)) } });
    render(<CommentThread tabId="t1" thread={thread} onPosted={vi.fn()} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), 'thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  test('shows the error and keeps the text when posting fails', async () => {
    // given
    const reply = vi.fn(() =>
      Promise.reject(new Error("Error invoking remote method 'pr:reply': Error: replying to comment: not found")),
    );
    fakeMaple({ pr: { reply } });
    const onPosted = vi.fn();
    render(<CommentThread tabId="t1" thread={thread} onPosted={onPosted} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), 'thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^replying to comment: not found$/);
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('thanks');
    expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled();
    expect(onPosted).not.toHaveBeenCalled();
  });

  test('clears the error when a retry posts', async () => {
    // given
    const reply = vi.fn().mockRejectedValueOnce(new Error('replying to comment: offline')).mockResolvedValue(undefined);
    fakeMaple({ pr: { reply } });
    render(<CommentThread tabId="t1" thread={thread} onPosted={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), 'thanks');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByRole('alert');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    await vi.waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(reply).toHaveBeenCalledTimes(2);
  });
});
