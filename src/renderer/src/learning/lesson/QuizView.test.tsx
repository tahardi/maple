import type { QuizQuestion } from '@shared/types/learning/quizQuestion';
import type { QuizResult } from '@shared/types/learning/quizResult';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { QuizView } from './QuizView';

const PATH = 'Learning/Security/xss.md';

const QUESTIONS: readonly QuizQuestion[] = [
  { question: 'What is it?', choices: ['Script injection', 'A font'] },
  { question: 'Who attacks?', choices: ['Anyone', 'Nobody'] },
];

const RESULT: QuizResult = {
  score: 1,
  total: 2,
  results: [
    { correct: true, answer: 0, why: 'Scripts run.' },
    { correct: false, answer: 0, why: 'Anyone can post.' },
  ],
};

describe('QuizView', () => {
  test('Submit stays disabled with its reason until every question is answered', async () => {
    // given
    fakeMaple();
    render(<QuizView path={PATH} questions={QUESTIONS} />);
    // when
    await userEvent.click(screen.getByRole('radio', { name: 'Script injection' }));
    // then
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByText('Answer every question')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('radio', { name: 'Nobody' }));
    // then
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(screen.queryByText('Answer every question')).not.toBeInTheDocument();
  });

  test('Submit calls grade and shows the score, marks, and explanations', async () => {
    // given
    const grade = vi.fn(() => Promise.resolve(RESULT));
    fakeMaple({ learning: { grade } });
    render(<QuizView path={PATH} questions={QUESTIONS} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Script injection' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Nobody' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // then
    expect(grade).toHaveBeenCalledWith(PATH, [0, 1]);
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('group');
    expect(within(first).getByText('Correct')).toBeInTheDocument();
    expect(within(first).getByText('Scripts run.')).toBeInTheDocument();
    expect(within(second).getByText('Wrong')).toBeInTheDocument();
    expect(within(second).getByText('Right answer: Anyone')).toBeInTheDocument();
    expect(within(second).getByText('Anyone can post.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  test('shows why grading failed', async () => {
    // given
    fakeMaple({ learning: { grade: () => Promise.reject(new Error('grading quiz: x has no quiz')) } });
    render(<QuizView path={PATH} questions={QUESTIONS} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Script injection' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Nobody' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // then
    expect(await screen.findByText('grading quiz: x has no quiz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  test('Try again clears the answers', async () => {
    // given
    fakeMaple({ learning: { grade: () => Promise.resolve(RESULT) } });
    render(<QuizView path={PATH} questions={QUESTIONS} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Script injection' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Nobody' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    // then
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
    expect(screen.queryByText('1 of 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });
});
