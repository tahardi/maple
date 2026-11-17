import { describe, expect, test } from 'vitest';
import { readReviewSource } from './readReviewSource';

const PATH = 'Learning/Security/xss.md';

const QUIZ = {
  questions: [
    { question: 'A?', choices: ['a', 'b'], answer: 0, why: 'Because a.' },
    { question: 'B?', choices: ['a', 'b'], answer: 1, why: 'Because b.' },
    { question: 'C?', choices: ['a', 'b'], answer: 0, why: 'Because c.' },
  ],
};

function lessonText(frontmatter: string, quizTag = 'maple-quiz'): string {
  return [
    '---',
    frontmatter,
    '---',
    '# XSS',
    '',
    '## Lesson',
    '',
    '### Quiz',
    '',
    `\`\`\`${quizTag}`,
    JSON.stringify(QUIZ),
    '```',
    '',
  ].join('\n');
}

const GRADED =
  'grades:\n  - date: 2026-11-01\n    score: 3\n    total: 3\n' +
  'reviews:\n  - date: 2026-11-02\n    question: 1\n    right: false';

describe('readReviewSource', () => {
  test.each([
    {
      name: 'a note with a quiz, grades, and reviews gives its source',
      text: lessonText(GRADED),
      want: {
        path: PATH,
        title: 'XSS',
        questions: 3,
        grades: [{ date: '2026-11-01' }],
        reviews: [{ date: '2026-11-02', question: 1, right: false }],
      },
    },
    {
      name: 'grades and reviews that are not lists give empty lists',
      text: lessonText('grades: oops\nreviews: 3'),
      want: { path: PATH, title: 'XSS', questions: 3, grades: [], reviews: [] },
    },
    {
      name: 'reviews with a bad entry give an empty list',
      text: lessonText('grades: []\nreviews:\n  - date: 2026-11-02\n    question: one\n    right: true'),
      want: { path: PATH, title: 'XSS', questions: 3, grades: [], reviews: [] },
    },
  ])('$name', ({ text, want }) => {
    // given
    const note = text;
    // when
    const got = readReviewSource(PATH, note);
    // then
    expect(got?.source).toEqual(want);
    expect(got?.key).toEqual(QUIZ);
  });

  test.each([
    { name: 'a note with no quiz', text: lessonText('grades: []', 'json') },
    { name: 'a note with no lesson', text: '---\ngrades: []\n---\n# XSS\n' },
    { name: 'a note with bad YAML', text: lessonText('grades: [') },
  ])('$name gives null', ({ text }) => {
    // given
    const note = text;
    // when
    const got = readReviewSource(PATH, note);
    // then
    expect(got).toBeNull();
  });
});
