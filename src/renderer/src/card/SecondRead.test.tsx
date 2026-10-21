import type { Finding } from '@shared/types';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { SecondRead } from './SecondRead';

const findings: readonly Finding[] = [
  { path: 'src/a.ts', line: 3, text: 'off by one' },
  { path: 'src/b.ts', line: 10, text: 'missing null check' },
];

function setup(comment = vi.fn(() => Promise.resolve())) {
  fakeMaple({ pr: { comment } });
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  render(<SecondRead tabId="t1" findings={findings} onOpen={onOpen} onRemove={onRemove} />);
  const first = screen.getAllByRole('listitem')[0];
  return { comment, onOpen, onRemove, first };
}

describe('SecondRead', () => {
  test('shows the place and text of each finding', () => {
    // given
    setup();
    // when
    const items = screen.getAllByRole('listitem');
    // then
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('src/a.ts:3');
    expect(items[0]).toHaveTextContent('off by one');
    expect(items[1]).toHaveTextContent('src/b.ts:10');
    expect(items[1]).toHaveTextContent('missing null check');
  });

  test('says so when there are no findings', () => {
    // given
    fakeMaple();
    // when
    render(<SecondRead tabId="t1" findings={[]} onOpen={vi.fn()} onRemove={vi.fn()} />);
    // then
    expect(screen.getByText('No findings')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  test('Open opens the file', async () => {
    // given
    const { onOpen, first } = setup();
    // when
    await userEvent.click(within(first).getByRole('button', { name: 'Open' }));
    // then
    expect(onOpen).toHaveBeenCalledWith('src/a.ts');
  });

  test('Post posts the finding as a line comment and removes it', async () => {
    // given
    const { comment, onRemove, first } = setup();
    // when
    await userEvent.click(within(first).getByRole('button', { name: 'Post' }));
    // then
    expect(comment).toHaveBeenCalledWith('t1', 'src/a.ts', 3, 'off by one');
    expect(onRemove).toHaveBeenCalledWith(findings[0]);
  });

  test('Dismiss removes it without posting', async () => {
    // given
    const { comment, onRemove, first } = setup();
    // when
    await userEvent.click(within(first).getByRole('button', { name: 'Dismiss' }));
    // then
    expect(comment).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(findings[0]);
  });

  test('shows the error and keeps the finding when Post fails', async () => {
    // given
    const comment = vi.fn(() =>
      Promise.reject(
        new Error(
          "Error invoking remote method 'pr:comment': Error: commenting on line: line must be part of the diff",
        ),
      ),
    );
    const { onRemove, first } = setup(comment);
    // when
    await userEvent.click(within(first).getByRole('button', { name: 'Post' }));
    // then
    expect(await within(first).findByRole('alert')).toHaveTextContent(
      'commenting on line: line must be part of the diff',
    );
    expect(onRemove).not.toHaveBeenCalled();
    expect(within(first).getByRole('button', { name: 'Post' })).toBeEnabled();
  });
});
