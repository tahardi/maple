import { render, screen, within } from '@testing-library/react';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { fullLesson } from '@renderer/testing/fullLessonFixture';
import { lesson } from '@renderer/testing/lessonFixture';
import { LessonPage } from './LessonPage';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));
vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

const PATH = 'Learning/Security/xss.md';

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
    expect(screen.getByRole('heading', { name: 'How an attack works' })).toBeInTheDocument();
    expect(screen.getByText('An attacker names a branch.')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    const findings = screen.getByRole('list', { name: 'Findings' });
    const [first, second] = within(findings).getAllByRole('listitem');
    expect(within(first).getByText('2026-11-12 MPL-340: Branch name reaches the shell')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'https://github.com/example/repo/pull/1' })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/pull/1',
    );
    expect(within(first).getByText('shell', { selector: 'em' })).toBeInTheDocument();
    expect(within(second).getByText('No PR yet')).toBeInTheDocument();
    expect(within(second).getByText('Tie-in pending')).toBeInTheDocument();
  });

  test.each([
    { name: 'no explanation', fields: { explanation: null }, message: 'Not written yet.' },
    { name: 'no attack', fields: { attack: null }, message: 'Not written yet.' },
    { name: 'no findings', fields: { findings: [] }, message: 'No findings yet.' },
  ])('shows an empty state for $name and the rest of the page', async ({ fields, message }) => {
    // given
    fakeMaple({ learning: { read: () => Promise.resolve(fullLesson('xss', fields)) } });
    // when
    render(<LessonPage path={PATH} />);
    // then
    expect(await screen.findByText(message)).toBeInTheDocument();
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
