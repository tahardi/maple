import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonSteps } from './LessonSteps';

const STEPS = [
  { name: 'One', pages: 1, body: () => <p>first</p> },
  { name: 'Two', pages: 1, body: () => <p>second</p> },
  { name: 'Three', pages: 1, body: () => <p>third</p> },
];

function shown(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
}

describe('LessonSteps', () => {
  test('Steps mode shows only the current step and moves with Next and Back', async () => {
    // given
    render(<LessonSteps steps={STEPS} onePage={false} />);
    const nav = screen.getByRole('navigation', { name: 'Lesson steps' });
    // when
    await userEvent.click(within(nav).getByRole('button', { name: 'Next: Two' }));
    // then
    expect(shown()).toEqual(['Two']);
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    // when
    await userEvent.click(within(nav).getByRole('button', { name: 'Back' }));
    // then
    expect(shown()).toEqual(['One']);
    expect(within(nav).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  test('Next walks through each page of a step before the next step', async () => {
    // given
    const steps = [
      STEPS[0],
      { name: 'Code', pages: 2, body: (page: number | null) => <p>{`page ${String(page)}`}</p> },
      STEPS[2],
    ];
    render(<LessonSteps steps={steps} onePage={false} />);
    const nav = screen.getByRole('navigation', { name: 'Lesson steps' });
    const seen: string[] = [];
    // when
    for (const label of ['Next: Code (1 of 2)', 'Next: Code (2 of 2)', 'Next: Three']) {
      await userEvent.click(within(nav).getByRole('button', { name: label }));
      seen.push(`${shown().join()} ${screen.getByText(/^Step \d of 3$/).textContent}`);
    }
    // then
    expect(seen).toEqual(['Code Step 2 of 3', 'Code Step 2 of 3', 'Three Step 3 of 3']);
    // when
    await userEvent.click(within(nav).getByRole('button', { name: 'Back' }));
    // then
    expect(screen.getByText('page 1')).toBeInTheDocument();
  });

  test('one page shows every step with no progress or buttons', () => {
    // given
    const steps = STEPS;
    // when
    render(<LessonSteps steps={steps} onePage />);
    // then
    expect(shown()).toEqual(['One', 'Two', 'Three']);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Step \d/)).not.toBeInTheDocument();
  });
});
