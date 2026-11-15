import type { PrComment } from '@shared/types/github/prComment';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { CommentsView } from './CommentsView';

const comment: PrComment = {
  url: 'https://github.com/tahardi/maple/pull/33#issuecomment-2001',
  author: 'tahardi',
  at: '2026-10-25T10:00:00Z',
  body: 'Looks **bold**.',
};

describe('CommentsView', () => {
  test('lists the conversation with author, time, and Markdown body', () => {
    // given
    fakeMaple();
    // when
    const { container } = render(<CommentsView tabId="t1" comments={[comment]} canPost onPosted={vi.fn()} />);
    // then
    expect(screen.getByText('tahardi')).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-10-25T10:00:00Z');
  });

  test('shows a note when the PR has no comments', () => {
    // given
    fakeMaple();
    // when
    render(<CommentsView tabId="t1" comments={[]} canPost onPosted={vi.fn()} />);
    // then
    expect(screen.getByText('No comments yet')).toBeInTheDocument();
  });

  test('posts a top-level comment and clears the box', async () => {
    // given
    const commentOnPr = vi.fn(() => Promise.resolve());
    fakeMaple({ pr: { commentOnPr } });
    const onPosted = vi.fn();
    render(<CommentsView tabId="t1" comments={[]} canPost onPosted={onPosted} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Comment on the PR' }), 'ship it');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(commentOnPr).toHaveBeenCalledWith('t1', 'ship it');
    expect(onPosted).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Comment on the PR' })).toHaveValue('');
  });

  test('shows why a post failed and keeps the text', async () => {
    // given
    const commentOnPr = vi.fn(() =>
      Promise.reject(new Error("Error invoking remote method 'pr:commentOnPr': Error: commenting on PR: offline")),
    );
    fakeMaple({ pr: { commentOnPr } });
    const onPosted = vi.fn();
    render(<CommentsView tabId="t1" comments={[]} canPost onPosted={onPosted} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Comment on the PR' }), 'ship it');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('commenting on PR: offline');
    expect(onPosted).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Comment on the PR' })).toHaveValue('ship it');
  });

  test('hides the comment box when the PR is not open', () => {
    // given
    fakeMaple();
    // when
    render(<CommentsView tabId="t1" comments={[comment]} canPost={false} onPosted={vi.fn()} />);
    // then
    expect(screen.queryByRole('textbox', { name: 'Comment on the PR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
  });
});
