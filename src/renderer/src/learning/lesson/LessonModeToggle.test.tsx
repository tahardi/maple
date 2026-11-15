import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonModeToggle } from './LessonModeToggle';

describe('LessonModeToggle', () => {
  test.each([
    { onePage: false, pressed: 'Steps', other: 'One page', chosen: true },
    { onePage: true, pressed: 'One page', other: 'Steps', chosen: false },
  ])('marks $pressed pressed and reports a click on $other', async ({ onePage, pressed, other, chosen }) => {
    // given
    const onChange = vi.fn();
    render(<LessonModeToggle onePage={onePage} onChange={onChange} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: other }));
    // then
    expect(screen.getByRole('button', { name: pressed })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: other })).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).toHaveBeenCalledWith(chosen);
  });
});
