import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonStepNav } from './LessonStepNav';

describe('LessonStepNav', () => {
  test.each([
    { at: 0, back: false, next: true },
    { at: 1, back: true, next: true },
    { at: 2, back: true, next: false },
  ])('at place $at of 3 enables Back $back and Next $next with fixed labels', ({ at, back, next }) => {
    // given
    const onMove = vi.fn();
    // when
    render(<LessonStepNav count={3} at={at} onMove={onMove} />);
    // then
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', !back);
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', !next);
    expect(screen.getByRole('navigation').textContent).toBe('BackNext');
  });

  test('Back and Next report the place to move to', async () => {
    // given
    const onMove = vi.fn();
    render(<LessonStepNav count={3} at={1} onMove={onMove} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    // then
    expect(onMove.mock.calls).toEqual([[0], [2]]);
  });
});
