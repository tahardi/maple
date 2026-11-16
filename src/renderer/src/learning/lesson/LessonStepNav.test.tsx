import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonStepNav } from './LessonStepNav';

const PLACES = [
  { step: 0, page: 0, label: 'One' },
  { step: 1, page: 0, label: 'Code (1 of 2)' },
  { step: 1, page: 1, label: 'Code (2 of 2)' },
];

describe('LessonStepNav', () => {
  test.each([
    { at: 0, back: false, next: 'Next: Code (1 of 2)' },
    { at: 1, back: true, next: 'Next: Code (2 of 2)' },
    { at: 2, back: true, next: null },
  ])('at place $at shows Back enabled $back and $next', ({ at, back, next }) => {
    // given
    const onMove = vi.fn();
    // when
    render(<LessonStepNav places={PLACES} at={at} onMove={onMove} />);
    // then
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', !back);
    expect(screen.getByRole('navigation').textContent).toBe(`Back${next ?? ''}`);
    expect(screen.queryByRole('button', { name: /^Next/ })?.textContent ?? null).toBe(next);
  });

  test('Back and Next report the place to move to', async () => {
    // given
    const onMove = vi.fn();
    render(<LessonStepNav places={PLACES} at={1} onMove={onMove} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next: Code (2 of 2)' }));
    // then
    expect(onMove.mock.calls).toEqual([[0], [2]]);
  });
});
