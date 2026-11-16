import type { ReviewQuestion } from '@shared/types/learning/reviewQuestion';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { fullLesson } from '@renderer/testing/fullLessonFixture';
import { lesson } from '@renderer/testing/lessonFixture';
import { LessonPage } from './LessonPage';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));
vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

const PATH = 'Learning/Security/xss.md';

const STEPS = ['What it is', 'The attack', 'Walk the code', 'Your finding', 'Quiz'];

const REVIEW: ReviewQuestion = {
  path: 'Learning/Security/sqli.md',
  title: 'SQL injection',
  index: 0,
  question: 'Fix?',
  choices: ['Bind', 'Hope'],
};

function visibleSteps(): string[] {
  return STEPS.filter((name) => screen.queryByRole('heading', { name, level: 2 }) !== null);
}

async function openLesson(fields: Parameters<typeof fullLesson>[1] = {}, learning = {}): Promise<void> {
  fakeMaple({ learning: { read: () => Promise.resolve(fullLesson('xss', fields)), ...learning } });
  render(<LessonPage path={PATH} />);
  await screen.findByRole('heading', { level: 1 });
}

async function goTo(step: string): Promise<void> {
  const labels = step === 'Walk the code' ? ['Walk the code (1 of 2)', 'Walk the code (2 of 2)'] : [step];
  const nav = screen.getByRole('navigation', { name: 'Lesson steps' });
  for (const label of labels) {
    expect(screen.getByText(`Next: ${label}`)).toBeVisible();
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
  }
}

describe('LessonPage', () => {
  test('shows the explanation, attack, trace, quiz, and findings', async () => {
    // given
    const summary = lesson('xss', {
      title: 'Command injection',
      hasLesson: true,
      status: 'learned',
      lastGrade: { date: '2026-11-12', score: 2, total: 3 },
    });
    fakeMaple({ learning: { read: () => Promise.resolve(fullLesson('xss', { summary })) } });
    // when
    render(<LessonPage path={PATH} />);
    // then
    expect(await screen.findByRole('heading', { name: 'Command injection', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Learned')).toBeInTheDocument();
    expect(screen.getByText('Last quiz 2/3 on 2026-11-12')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What it is' })).toBeInTheDocument();
    expect(screen.getByText('shell', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The attack' })).toBeInTheDocument();
    expect(screen.getByText('An attacker names a branch.')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByText('Line 2: Step two.')).toBeInTheDocument();
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    const findings = screen.getByRole('list', { name: 'Your finding' });
    const [first, second] = Array.from(findings.children) as HTMLElement[];
    expect(within(first).getByText('2026-11-12 MPL-340: Branch name reaches the shell')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'https://github.com/example/repo/pull/1' })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/pull/1',
    );
    expect(within(first).getByText('shell', { selector: 'em' })).toBeInTheDocument();
    expect(within(second).getByText('No PR yet')).toBeInTheDocument();
    expect(within(second).getByText('Tie-in pending')).toBeInTheDocument();
    expect(within(first).getByText('Run any command as you.')).toBeInTheDocument();
    expect(within(second).queryByText('An attacker can now')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OWASP: Command Injection' })).toHaveAttribute(
      'href',
      'https://owasp.org/www-community/attacks/Command_Injection',
    );
  });

  test('opens a to-learn lesson in Steps on What it is', async () => {
    // given
    const fields = {};
    // when
    await openLesson(fields);
    // then
    expect(visibleSteps()).toEqual(['What it is']);
    expect(screen.getByRole('button', { name: 'Steps' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByText('Next: The attack')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.queryByText('First step')).not.toBeInTheDocument();
  });

  test('Back and Next sit in the top row beside the layout toggle', async () => {
    // given
    await openLesson();
    // when
    await goTo('The attack');
    // then
    const row = screen.getByRole('group', { name: 'Lesson layout' }).parentElement;
    const nav = screen.getByRole('navigation', { name: 'Lesson steps' });
    expect(row?.contains(nav)).toBe(true);
    expect(within(row ?? document.body).getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
  });

  test('opens a learned lesson in One page', async () => {
    // given
    const summary = lesson('xss', { title: 'Command injection', hasLesson: true, status: 'learned' });
    // when
    await openLesson({ summary });
    // then
    expect(visibleSteps()).toEqual(STEPS);
    expect(screen.getByRole('button', { name: 'One page' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('navigation', { name: 'Lesson steps' })).not.toBeInTheDocument();
  });

  test('Next and Back move between the five steps', async () => {
    // given
    await openLesson();
    const seen: string[][] = [];
    // when
    for (const step of STEPS.slice(1)) {
      await goTo(step);
      seen.push(visibleSteps());
    }
    // then
    expect(seen).toEqual(STEPS.slice(1).map((step) => [step]));
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Back: Your finding')).toBeInTheDocument();
    expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument();
    // when
    const nav = screen.getByRole('navigation', { name: 'Lesson steps' });
    await userEvent.click(within(nav).getByRole('button', { name: 'Back' }));
    // then
    expect(visibleSteps()).toEqual(['Your finding']);
  });

  test('One page shows all five steps', async () => {
    // given
    await openLesson();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'One page' }));
    // then
    expect(visibleSteps()).toEqual(STEPS);
    expect(screen.getByText('; rm -rf ~', { selector: 'mark' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Less trusted · GitHub' })).toBeVisible();
    expect(screen.getByTestId('editor')).toBeVisible();
    expect(screen.getByText('Run any command as you.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'OWASP: Command Injection' })).toBeVisible();
    expect(screen.getByText('Q1?')).toBeVisible();
  });

  test('quiz answers survive switching modes', async () => {
    // given
    await openLesson();
    await userEvent.click(screen.getByRole('button', { name: 'One page' }));
    const first = screen.getByRole('group', { name: 'Q1?' });
    await userEvent.click(within(first).getByRole('radio', { name: 'b' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Steps' }));
    for (const step of STEPS.slice(1)) {
      await goTo(step);
    }
    // then
    expect(within(screen.getByRole('group', { name: 'Q1?' })).getByRole('radio', { name: 'b' })).toBeChecked();
  });

  test('review questions survive switching modes and steps', async () => {
    // given
    const review = vi.fn(() => Promise.resolve([REVIEW]));
    const gradeReview = vi.fn(() => Promise.resolve({ correct: true, answer: 0, why: 'Binding keeps data apart.' }));
    await openLesson({}, { review, gradeReview });
    for (const step of STEPS.slice(1)) {
      await goTo(step);
    }
    const group = await screen.findByRole('group', { name: 'Review · SQL injection' });
    await userEvent.click(within(group).getByRole('radio', { name: 'Bind' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Check' }));
    await screen.findByText('Binding keeps data apart.');
    // when
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Lesson steps' })).getByRole('button', { name: 'Back' }),
    );
    await goTo('Quiz');
    await userEvent.click(screen.getByRole('button', { name: 'One page' }));
    // then
    expect(screen.getByText('Binding keeps data apart.')).toBeVisible();
    expect(review).toHaveBeenCalledTimes(1);
  });

  test('stays in Steps when a vault change marks the lesson learned', async () => {
    // given
    let changed = (): void => undefined;
    const learned = lesson('xss', { title: 'Command injection', hasLesson: true, status: 'learned' });
    const read = vi
      .fn()
      .mockResolvedValueOnce(fullLesson('xss'))
      .mockResolvedValue(fullLesson('xss', { summary: learned }));
    fakeMaple({
      learning: { read },
      vault: {
        onChanged: (cb: () => void) => {
          changed = cb;
          return () => undefined;
        },
      },
    });
    render(<LessonPage path={PATH} />);
    await screen.findByText('To learn');
    // when
    act(() => {
      changed();
    });
    await screen.findByText('Learned');
    // then
    expect(visibleSteps()).toEqual(['What it is']);
    expect(screen.getByRole('button', { name: 'Steps' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a missing example leaves What it is as text only', async () => {
    // given
    const fields = { example: null };
    // when
    await openLesson(fields);
    // then
    expect(screen.getByText('shell', { selector: 'strong' })).toBeVisible();
    expect(screen.queryByText('; rm -rf ~')).not.toBeInTheDocument();
  });

  test.each([
    {
      name: 'no explanation',
      fields: { explanation: null },
      message: 'Not written yet.',
      kept: 'An attacker names a branch.',
    },
    { name: 'no attack', fields: { attack: null }, message: 'Not written yet.', kept: 'Builds a' },
    { name: 'no findings', fields: { findings: [] }, message: 'No findings yet.', kept: 'An attacker names a branch.' },
  ])('shows an empty state for $name and the rest of the page', async ({ fields, message, kept }) => {
    // given
    fakeMaple({ learning: { read: () => Promise.resolve(fullLesson('xss', fields)) } });
    // when
    render(<LessonPage path={PATH} />);
    // then
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(kept, { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByText('Q1?')).toBeInTheDocument();
  });

  test('shows a Notice for a bad trace and still shows the quiz', async () => {
    // given
    const bad = fullLesson('xss', { trace: null, traceError: 'reading lesson: trace: the block is not valid JSON' });
    fakeMaple({ learning: { read: () => Promise.resolve(bad) } });
    // when
    render(<LessonPage path={PATH} />);
    // then
    expect(
      await screen.findByText(
        'reading lesson: trace: the block is not valid JSON. Ask the Learning session to fix it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.getByText('Q1?')).toBeInTheDocument();
  });

  test('shows a Notice for a bad quiz and still shows the trace', async () => {
    // given
    const bad = fullLesson('xss', { quiz: null, quizError: 'reading lesson: quiz: found 0 maple-quiz blocks, want 1' });
    fakeMaple({ learning: { read: () => Promise.resolve(bad) } });
    // when
    render(<LessonPage path={PATH} />);
    // then
    expect(
      await screen.findByText(
        'reading lesson: quiz: found 0 maple-quiz blocks, want 1. Ask the Learning session to fix it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  test('shows why the lesson could not be read', async () => {
    // given
    fakeMaple({ learning: { read: () => Promise.reject(new Error('reading lesson: x is not a lesson note')) } });
    // when
    render(<LessonPage path={PATH} />);
    // then
    expect(await screen.findByText('reading lesson: x is not a lesson note')).toBeInTheDocument();
  });
});
