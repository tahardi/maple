import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Notice } from './Notice';

describe('Notice', () => {
  test.each([
    { tone: 'danger', role: 'alert' },
    { tone: 'warning', role: 'status' },
    { tone: 'info', role: 'status' },
    { tone: 'success', role: 'status' },
  ] as const)('a $tone notice has role $role', ({ tone, role }) => {
    // given
    const text = 'Something happened';
    // when
    render(<Notice tone={tone}>{text}</Notice>);
    // then
    expect(screen.getByRole(role)).toHaveAttribute('data-tone', tone);
  });

  test('shows its text and buttons', () => {
    // given
    const children = (
      <>
        <span>File changed on disk</span>
        <button>Reload</button>
      </>
    );
    // when
    render(<Notice tone="warning">{children}</Notice>);
    // then
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('File changed on disk');
    expect(within(notice).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  test('a notice with onDismiss shows a Dismiss button that calls it', async () => {
    // given
    const onDismiss = vi.fn();
    render(
      <Notice tone="warning" onDismiss={onDismiss}>
        Saved state was unreadable
      </Notice>,
    );
    // when
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' }));
    // then
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('a notice without onDismiss has no Dismiss button', () => {
    // given
    const text = 'reading config: bad json';
    // when
    render(<Notice tone="danger">{text}</Notice>);
    // then
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});
