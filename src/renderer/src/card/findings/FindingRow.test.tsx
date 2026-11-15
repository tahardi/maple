import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { finding, glance } from '@renderer/testing/findingsFixture';
import { FindingRow } from './FindingRow';

describe('FindingRow', () => {
  test.each([
    {
      name: 'the recommendation',
      given: finding({ ...glance, severityOverride: 'medium' }),
      tone: 'warning',
      note: 'Recommended: Fix now',
    },
    { name: 'no note for an old finding', given: finding(), tone: 'danger', note: null },
  ])('shows severity, title, and $name', async ({ given, tone, note }) => {
    // given
    const onOpen = vi.fn();
    render(<FindingRow finding={given} onOpen={onOpen} />);
    const row = screen.getByRole('button', { name: /Branch name reaches a shell/ });
    // when
    await userEvent.click(row);
    // then
    expect(row.querySelector('[data-tone]')).toHaveAttribute('data-tone', tone);
    if (note === null) {
      expect(row).toHaveTextContent(/^(high|medium)Branch name reaches a shell$/);
    } else {
      expect(screen.getByText(note)).toBeInTheDocument();
    }
    expect(onOpen).toHaveBeenCalledWith('F1');
  });
});
