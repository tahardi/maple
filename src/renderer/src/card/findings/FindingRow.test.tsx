import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { finding, glance } from '@renderer/testing/findingsFixture';
import { FindingRow } from './FindingRow';

describe('FindingRow', () => {
  test('shows severity, title, and the recommendation', async () => {
    // given
    const onOpen = vi.fn();
    render(<FindingRow finding={finding({ ...glance, severityOverride: 'medium' })} onOpen={onOpen} />);
    const row = screen.getByRole('button', { name: /Branch name reaches a shell/ });
    // when
    await userEvent.click(row);
    // then
    expect(screen.getByText('medium')).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByText('Recommended: Fix now')).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledWith('F1');
  });
});
