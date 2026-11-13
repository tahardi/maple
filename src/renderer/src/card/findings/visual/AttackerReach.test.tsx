import { render, screen, within } from '@testing-library/react';
import { AttackerReach } from './AttackerReach';

describe('AttackerReach', () => {
  test.each([
    { heading: 'An attacker can now', items: ['Run commands.', 'Read the token.'] },
    { heading: 'After the fix', items: ['Open a pull request.'] },
  ])('shows each item under "$heading"', ({ heading, items }) => {
    // given
    // when
    render(<AttackerReach now={['Run commands.', 'Read the token.']} afterFix={['Open a pull request.']} />);
    // then
    const list = screen.getByRole('list', { name: heading });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(items);
  });

  test('says "Nothing" when the fix leaves the attacker nothing', () => {
    // given
    // when
    render(<AttackerReach now={['Run commands.']} afterFix={[]} />);
    // then
    const list = screen.getByRole('list', { name: 'After the fix' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Nothing']);
  });
});
