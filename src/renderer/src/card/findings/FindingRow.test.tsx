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
      text: 'mediumBranch name reaches a shellRecommended: Fix now',
    },
    { name: 'no note for an old finding', given: finding(), tone: 'danger', text: 'highBranch name reaches a shell' },
  ])('shows severity, title, and $name', async ({ given, tone, text }) => {
    // given
    const onOpen = vi.fn();
    render(<FindingRow finding={given} onOpen={onOpen} />);
    const row = screen.getByRole('button', { name: /Branch name reaches a shell/ });
    // when
    await userEvent.click(row);
    // then
    expect(row.querySelector('[data-tone]')).toHaveAttribute('data-tone', tone);
    expect(row.textContent).toBe(text);
    expect(onOpen).toHaveBeenCalledWith('F1');
  });
});
