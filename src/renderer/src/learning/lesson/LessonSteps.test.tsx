import { render, screen } from '@testing-library/react';
import { LessonSteps } from './LessonSteps';

const STEPS = [
  { name: 'One', pages: 1, body: () => <p>first</p> },
  { name: 'Code', pages: 2, body: (page: number | null) => <p>{`page ${String(page)}`}</p> },
  { name: 'Three', pages: 1, body: () => <p>third</p> },
];

const PLACES = [
  { step: 0, page: 0, label: 'One' },
  { step: 1, page: 0, label: 'Code (1 of 2)' },
  { step: 1, page: 1, label: 'Code (2 of 2)' },
  { step: 2, page: 0, label: 'Three' },
];

function shown(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
}

describe('LessonSteps', () => {
  test('Steps mode shows only the step and page of the current place', () => {
    // given
    const at = 2;
    // when
    render(<LessonSteps steps={STEPS} onePage={false} places={PLACES} at={at} />);
    // then
    expect(shown()).toEqual(['Code']);
    expect(screen.getByText('page 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Back: Code (1 of 2)')).toBeInTheDocument();
    expect(screen.getByText('Next: Three')).toBeInTheDocument();
  });

  test.each([
    { at: 0, back: null, next: 'Next: Code (1 of 2)' },
    { at: 3, back: 'Back: Code (2 of 2)', next: null },
  ])('at place $at the ends show only the side that exists', ({ at, back, next }) => {
    // given
    const places = PLACES;
    // when
    render(<LessonSteps steps={STEPS} onePage={false} places={places} at={at} />);
    // then
    expect(screen.queryByText(/^Back:/)?.textContent ?? null).toBe(back);
    expect(screen.queryByText(/^Next:/)?.textContent ?? null).toBe(next);
  });

  test('one page shows every step with no page and no progress', () => {
    // given
    const at = 0;
    // when
    render(<LessonSteps steps={STEPS} onePage places={PLACES} at={at} />);
    // then
    expect(shown()).toEqual(['One', 'Code', 'Three']);
    expect(screen.getByText('page null')).toBeInTheDocument();
    expect(screen.queryByText(/^Step \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Back|Next):/)).not.toBeInTheDocument();
  });
});
