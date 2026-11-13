import type { Lesson } from '@shared/types/learning/lesson';
import { lesson } from './lessonFixture';

export function fullLesson(slug: string, fields: Partial<Lesson> = {}): Lesson {
  return {
    summary: lesson(slug, { title: 'Command injection', hasLesson: true }),
    explanation: 'Builds a **shell** command.',
    attack: 'An attacker names a branch.',
    trace: {
      lang: 'typescript',
      code: 'const a = 1\nrun(a)',
      steps: [
        { lines: [1, 1], text: 'Step one.' },
        { lines: [2, 2], text: 'Step two.' },
      ],
    },
    traceError: null,
    quiz: [
      { question: 'Q1?', choices: ['a', 'b'] },
      { question: 'Q2?', choices: ['a', 'b'] },
      { question: 'Q3?', choices: ['a', 'b'] },
    ],
    quizError: null,
    findings: [
      {
        date: '2026-11-12',
        card: 'MPL-340',
        title: 'Branch name reaches the shell',
        pr: 'https://github.com/example/repo/pull/1',
        tieIn: 'The branch goes into a *shell* string.',
      },
      { date: '2026-11-13', card: 'MPL-341', title: 'Pending one', pr: null, tieIn: null },
    ],
    ...fields,
  };
}
