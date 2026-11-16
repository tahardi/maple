import type { ReviewQuestion as Review } from '@shared/types/learning/reviewQuestion';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { ReviewQuestion } from './ReviewQuestion';

const REVIEW: Review = {
  path: 'Learning/Security/sqli.md',
  title: 'SQL injection',
  index: 1,
  question: 'What stops it?',
  choices: ['Bound parameters', 'A longer password'],
};

describe('ReviewQuestion', () => {
  test('labels the question with its lesson and keeps Check disabled until a choice is made', () => {
    // given
    fakeMaple();
    // when
    render(<ReviewQuestion review={REVIEW} />);
    // then
    expect(screen.getByRole('group', { name: 'Review · SQL injection' })).toBeInTheDocument();
    expect(screen.getByText('What stops it?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    expect(screen.getByText('Pick an answer')).toBeInTheDocument();
  });

  test('Check grades the answer and shows the mark and explanation', async () => {
    // given
    const gradeReview = vi.fn(() => Promise.resolve({ correct: false, answer: 0, why: 'Parameters are not code.' }));
    fakeMaple({ learning: { gradeReview } });
    render(<ReviewQuestion review={REVIEW} />);
    await userEvent.click(screen.getByRole('radio', { name: 'A longer password' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    // then
    expect(gradeReview).toHaveBeenCalledWith(REVIEW.path, 1, 1);
    expect(await screen.findByText('Wrong')).toBeInTheDocument();
    expect(screen.getByText('Right answer: Bound parameters')).toBeInTheDocument();
    expect(screen.getByText('Parameters are not code.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument();
  });

  test('shows why grading failed', async () => {
    // given
    fakeMaple({ learning: { gradeReview: () => Promise.reject(new Error('grading review: x has no question 1')) } });
    render(<ReviewQuestion review={REVIEW} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Bound parameters' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    // then
    expect(await screen.findByText('grading review: x has no question 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();
  });
});
