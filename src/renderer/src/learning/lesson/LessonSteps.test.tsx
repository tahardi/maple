import { render, screen } from '@testing-library/react';
import { LessonSteps } from './LessonSteps';

const STEPS = [
  { name: 'One', pages: 1, body: () => <p>first</p> },
  { name: 'Code', pages: 2, body: (page: number | null) => <p>{`page ${String(page)}`}</p> },
  { name: 'Three', pages: 1, body: () => <p>third</p> },
];

function shown(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
}

describe('LessonSteps', () => {
  test('Steps mode shows only the step and page of the current place', () => {
    // given
    const place = { step: 1, page: 1, label: 'Code (2 of 2)' };
    // when
    render(<LessonSteps steps={STEPS} onePage={false} place={place} />);
    // then
    expect(shown()).toEqual(['Code']);
    expect(screen.getByText('page 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  test('one page shows every step with no page and no progress', () => {
    // given
    const place = { step: 0, page: 0, label: 'One' };
    // when
    render(<LessonSteps steps={STEPS} onePage place={place} />);
    // then
    expect(shown()).toEqual(['One', 'Code', 'Three']);
    expect(screen.getByText('page null')).toBeInTheDocument();
    expect(screen.queryByText(/^Step \d/)).not.toBeInTheDocument();
  });
});
