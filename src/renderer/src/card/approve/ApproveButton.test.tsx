import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApproveButton } from './ApproveButton';

describe('ApproveButton', () => {
  test('reads Approve & merge and is primary', async () => {
    // given
    const onClick = vi.fn();
    render(<ApproveButton blocker={null} busy={false} onClick={onClick} onReloadReview={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Approve & merge' });
    // when
    await userEvent.click(button);
    // then
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toBeEnabled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('shows its blocker beside it when disabled', () => {
    // when
    render(<ApproveButton blocker="Checks are failing" busy={false} onClick={vi.fn()} onReloadReview={vi.fn()} />);
    // then
    const button = screen.getByRole('button', { name: 'Approve & merge' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Checks are failing')).toBeVisible();
    expect(button).toHaveAccessibleDescription('Checks are failing');
  });

  test('reads Merging… and is disabled while busy', () => {
    // when
    render(<ApproveButton blocker={null} busy onClick={vi.fn()} onReloadReview={vi.fn()} />);
    // then
    expect(screen.getByRole('button', { name: 'Merging…' })).toBeDisabled();
  });

  test.each(['Review not loaded', 'PR has new commits'])('offers Reload review when blocked by %s', async (blocker) => {
    // given
    const onReloadReview = vi.fn();
    render(<ApproveButton blocker={blocker} busy={false} onClick={vi.fn()} onReloadReview={onReloadReview} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload review' }));
    // then
    expect(onReloadReview).toHaveBeenCalledOnce();
  });

  test.each([null, 'Agent is working', 'Checks are failing'])(
    'offers no Reload review when blocked by %s',
    (blocker) => {
      // when
      render(<ApproveButton blocker={blocker} busy={false} onClick={vi.fn()} onReloadReview={vi.fn()} />);
      // then
      expect(screen.queryByRole('button', { name: 'Reload review' })).not.toBeInTheDocument();
    },
  );
});
