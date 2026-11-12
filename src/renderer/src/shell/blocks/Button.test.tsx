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

  test.each([
    { busy: false, text: 'Start' },
    { busy: true, text: 'Starting…' },
  ])('an ariaLabel names the button and busy=$busy shows "$text"', ({ busy, text }) => {
    // given
    // when
    render(<Button label="Start" ariaLabel="Start DIG-41" onClick={vi.fn()} busy={busy} busyLabel="Starting…" />);
    // then
    expect(screen.getByRole('button', { name: 'Start DIG-41' })).toHaveTextContent(new RegExp(`^${text}$`));
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

  test('a button with no type does not submit its form', async () => {
    // given
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => {
      e.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button label="Cancel" />
      </form>,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // then
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'pressed', pressed: true, want: 'true' },
    { name: 'not pressed', pressed: false, want: 'false' },
    { name: 'not a toggle', pressed: undefined, want: null },
  ])('a $name button sets aria-pressed to $want', ({ pressed, want }) => {
    // when
    render(<Button label="Changes" pressed={pressed} />);
    // then
    expect(screen.getByRole('button', { name: 'Changes' }).getAttribute('aria-pressed')).toBe(want);
  });

  test('a reason wins over a hint', () => {
    // when
    render(<Button label="Comment" reason="Review not loaded" hint="Select lines to comment on" />);
    // then
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAccessibleDescription('Review not loaded');
    expect(screen.getByText('Review not loaded')).not.toHaveAttribute('data-kind');
    expect(screen.queryByText('Select lines to comment on')).not.toBeInTheDocument();
  });

  test('a button with no reason, hint, or fix draws nothing after it', () => {
    // when
    render(<Button label="Start" reason={null} hint={null} fix={null} />);
    // then
    const button = screen.getByRole('button', { name: 'Start' });
    expect(button).not.toHaveAccessibleDescription();
    expect(button.nextSibling).toBeNull();
  });
});
