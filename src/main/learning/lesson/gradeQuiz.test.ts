import { describe, expect, test } from 'vitest';
import { gradeQuiz } from './gradeQuiz';

const KEY = {
  questions: [
    { question: 'A?', choices: ['a', 'b'], answer: 0, why: 'Because a.' },
    { question: 'B?', choices: ['a', 'b'], answer: 1, why: 'Because b.' },
    { question: 'C?', choices: ['a', 'b', 'c'], answer: 2, why: 'Because c.' },
  ],
};

describe('gradeQuiz', () => {
  test.each([
    { name: 'all right', answers: [0, 1, 2], score: 3, marks: [true, true, true] },
    { name: 'some right', answers: [0, 0, 2], score: 2, marks: [true, false, true] },
    { name: 'none right', answers: [1, 0, 0], score: 0, marks: [false, false, false] },
  ])('$name', ({ answers, score, marks }) => {
    // given
    const key = KEY;
    // when
    const got = gradeQuiz(key, answers);
    // then
    expect(got).toEqual({
      score,
      total: 3,
      results: [
        { correct: marks[0], answer: 0, why: 'Because a.' },
        { correct: marks[1], answer: 1, why: 'Because b.' },
        { correct: marks[2], answer: 2, why: 'Because c.' },
      ],
    });
  });

  test.each([
    { answers: [0, 1], error: 'grading quiz: expected 3 answers, got 2' },
    { answers: [0, 1, 2, 0], error: 'grading quiz: expected 3 answers, got 4' },
  ])('the wrong number of answers throws: $answers', ({ answers, error }) => {
    // given
    const key = KEY;
    // when
    const got = () => gradeQuiz(key, answers);
    // then
    expect(got).toThrow(error);
  });
});
