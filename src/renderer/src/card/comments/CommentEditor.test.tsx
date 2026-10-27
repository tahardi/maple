import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentEditor } from './CommentEditor';

describe('CommentEditor', () => {
  test('starts on Write with the text box', () => {
    // given
    const onChange = vi.fn();
    // when
    render(<CommentEditor label="Reply" value="hi" onChange={onChange} />);
    // then
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('hi');
  });

  test('reports typing through onChange', async () => {
    // given
    const onChange = vi.fn();
    render(<CommentEditor label="Reply" value="" onChange={onChange} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), 'a');
    // then
    expect(onChange).toHaveBeenCalledWith('a');
  });

  test('renders the draft as markdown on Preview', async () => {
    // given
    render(<CommentEditor label="Reply" value="**bold**" onChange={vi.fn()} />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    // then
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'false');
  });

  test.each([
    { name: 'an empty draft', value: '' },
    { name: 'a blank draft', value: '  \n' },
  ])('shows Nothing to preview for $name', async ({ value }) => {
    // given
    render(<CommentEditor label="Reply" value={value} onChange={vi.fn()} />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    // then
    expect(screen.getByText('Nothing to preview')).toBeInTheDocument();
  });

  test('returns to the draft on Write', async () => {
    // given
    render(<CommentEditor label="Reply" value="hi" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Write' }));
    // then
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('hi');
  });
});
