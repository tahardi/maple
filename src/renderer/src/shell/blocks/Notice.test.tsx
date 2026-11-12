import { render, screen, within } from '@testing-library/react';
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
});
