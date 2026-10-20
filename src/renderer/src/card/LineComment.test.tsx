import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { LineComment } from './LineComment';

describe('LineComment', () => {
  test('posts the text and closes on success', async () => {
    // given
    const comment = vi.fn(() => Promise.resolve());
    fakeMaple({ pr: { comment } });
    const onDone = vi.fn();
    render(<LineComment tabId="t1" path="src/a.ts" line={3} onDone={onDone} />);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'why?');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(screen.getByRole('heading', { name: 'Comment on src/a.ts:3' })).toBeInTheDocument();
    expect(comment).toHaveBeenCalledWith('t1', 'src/a.ts', 3, 'why?');
    expect(onDone).toHaveBeenCalled();
  });

  test('shows the error and keeps the text when posting fails', async () => {
    // given
    const comment = vi.fn(() =>
      Promise.reject(
        new Error(
          "Error invoking remote method 'pr:comment': Error: commenting on line: line must be part of the diff",
        ),
      ),
    );
    fakeMaple({ pr: { comment } });
    const onDone = vi.fn();
    render(<LineComment tabId="t1" path="src/a.ts" line={3} onDone={onDone} />);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'why?');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('commenting on line: line must be part of the diff');
    expect(screen.getByRole('textbox')).toHaveValue('why?');
    expect(onDone).not.toHaveBeenCalled();
  });

  test('Cancel closes without posting', async () => {
    // given
    const comment = vi.fn(() => Promise.resolve());
    fakeMaple({ pr: { comment } });
    const onDone = vi.fn();
    render(<LineComment tabId="t1" path="src/a.ts" line={3} onDone={onDone} />);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'why?');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // then
    expect(comment).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  test.each([
    { name: 'empty', text: '' },
    { name: 'blank', text: '   ' },
  ])('disables Post while the text is $name', async ({ text }) => {
    // given
    fakeMaple();
    render(<LineComment tabId="t1" path="src/a.ts" line={3} onDone={vi.fn()} />);
    // when
    if (text !== '') {
      await userEvent.type(screen.getByRole('textbox'), text);
    }
    // then
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  test('disables Post while a post is in flight', async () => {
    // given
    fakeMaple({ pr: { comment: vi.fn(() => new Promise<void>(() => undefined)) } });
    render(<LineComment tabId="t1" path="src/a.ts" line={3} onDone={vi.fn()} />);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'why?');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    // then
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });
});
