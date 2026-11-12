import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionBar } from './ActionBar';

describe('ActionBar', () => {
  test('renders one button per action', () => {
    // given
    const actions = [
      { label: 'Approve', onClick: vi.fn() },
      { label: 'Ship', onClick: vi.fn() },
    ];
    // when
    render(<ActionBar actions={actions} />);
    // then
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Approve', 'Ship']);
  });

  test('clicking an enabled action calls onClick', async () => {
    // given
    const onClick = vi.fn();
    render(<ActionBar actions={[{ label: 'Approve', onClick }]} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    // then
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('a disabled action shows its reason beside it and does not call onClick', async () => {
    // given
    const onClick = vi.fn();
    render(<ActionBar actions={[{ label: 'Approve', onClick, disabled: true, reason: 'No PR yet' }]} />);
    const button = screen.getByRole('button', { name: 'Approve' });
    // when
    await userEvent.click(button);
    // then
    expect(button).toBeDisabled();
    expect(screen.getByText('No PR yet')).toBeVisible();
    expect(button).toHaveAccessibleDescription('No PR yet');
    expect(onClick).not.toHaveBeenCalled();
  });

  test('a busy action shows its busy label', () => {
    // when
    render(<ActionBar actions={[{ label: 'Approve & merge', onClick: vi.fn(), busy: true, busyLabel: 'Merging…' }]} />);
    // then
    expect(screen.getByRole('button', { name: 'Merging…' })).toBeDisabled();
  });

  test('marks each action with its variant', () => {
    // given
    const actions = [
      { label: 'Approve', onClick: vi.fn(), variant: 'primary' as const },
      { label: 'Close', onClick: vi.fn(), variant: 'danger' as const },
      { label: 'Ship', onClick: vi.fn() },
    ];
    // when
    render(<ActionBar actions={actions} />);
    // then
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('data-variant', 'primary');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('data-variant', 'danger');
    expect(screen.getByRole('button', { name: 'Ship' })).not.toHaveAttribute('data-variant');
  });

  test('no actions renders no buttons', () => {
    // when
    render(<ActionBar actions={[]} />);
    // then
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('an enabled action shows no reason', () => {
    // when
    render(<ActionBar actions={[{ label: 'Approve', onClick: vi.fn() }]} />);
    // then
    const button = screen.getByRole('button', { name: 'Approve' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAccessibleDescription();
    expect(button.nextSibling).toBeNull();
  });

  test('renders its children after the actions', () => {
    // when
    render(
      <ActionBar actions={[{ label: 'Approve', onClick: vi.fn() }]}>
        <span>extra</span>
      </ActionBar>,
    );
    // then
    expect(screen.getByRole('button', { name: 'Approve' }).nextSibling).toHaveTextContent('extra');
  });
});
