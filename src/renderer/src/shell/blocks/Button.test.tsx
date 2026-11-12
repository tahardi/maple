import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  test('shows the label and calls onClick', async () => {
    // given
    const onClick = vi.fn();
    render(<Button label="Approve & merge" onClick={onClick} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Approve & merge' }));
    // then
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('a busy button is disabled, marked busy, and shows its busy label', async () => {
    // given
    const onClick = vi.fn();
    render(<Button label="Approve & merge" onClick={onClick} busy busyLabel="Merging…" />);
    const button = screen.getByRole('button', { name: 'Merging…' });
    // when
    await userEvent.click(button);
    // then
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  test('a busy button without a busy label keeps its label', () => {
    // when
    render(<Button label="Start" onClick={vi.fn()} busy />);
    // then
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  test('shows the reason beside the button as its description', () => {
    // when
    render(<Button label="Approve & merge" onClick={vi.fn()} disabled reason="Checks are failing" />);
    // then
    expect(screen.getByText('Checks are failing')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve & merge' })).toHaveAccessibleDescription('Checks are failing');
  });

  test('shows a hint muted beside the button as its description', () => {
    // when
    render(<Button label="Comment" onClick={vi.fn()} hint="Select lines to comment on" />);
    // then
    expect(screen.getByText('Select lines to comment on')).toHaveAttribute('data-kind', 'hint');
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAccessibleDescription('Select lines to comment on');
  });

  test('a fix button runs the fix', async () => {
    // given
    const fix = vi.fn();
    render(
      <Button
        label="Approve & merge"
        disabled
        reason="Review not loaded"
        fix={{ label: 'Reload review', onClick: fix }}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload review' }));
    // then
    expect(fix).toHaveBeenCalledOnce();
  });

  test('never sets a title', () => {
    // when
    render(
      <Button
        label="Approve & merge"
        disabled
        reason="Review not loaded"
        fix={{ label: 'Reload review', onClick: vi.fn() }}
      />,
    );
    // then
    expect(screen.getAllByRole('button').filter((b) => b.hasAttribute('title'))).toEqual([]);
  });
});
