import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonSteps } from './LessonSteps';

const STEPS = [
  { name: 'One', body: <p>first</p> },
  { name: 'Two', body: <p>second</p> },
  { name: 'Three', body: <p>third</p> },
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
