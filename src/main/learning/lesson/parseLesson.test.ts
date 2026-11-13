import { describe, expect, test } from 'vitest';
import { parseLesson } from './parseLesson';

const PATH = 'Learning/Security/command-injection.md';

const CODE =
  "import { exec } from 'node:child_process'\n\nexport function checkout(branch: string) {\n  exec(branch)\n}";

const TRACE = {
  lang: 'typescript',
  code: CODE,
  steps: [
    { lines: [3, 3], text: 'The branch name arrives.' },
    { lines: [4, 4], text: 'It reaches the shell.' },
  ],
};

const QUIZ = {
  questions: [
    { question: 'What makes it possible?', choices: ['Untrusted text', 'git'], answer: 0, why: 'The shell reads it.' },
    { question: 'Which call avoids the shell?', choices: ['exec', 'execFile'], answer: 1, why: 'No shell.' },
    { question: 'Who attacks?', choices: ['Anyone', 'The owner', 'Nobody'], answer: 0, why: 'Anyone names a branch.' },
  ],
};

function note({ trace = JSON.stringify(TRACE), quiz = JSON.stringify(QUIZ), extra = '' } = {}): string {
  return [
    '---',
    'class: command-injection',
    'status: to-learn',
    'grades: []',
    '---',
    '',
    '# Command injection',
    '',
    '## Lesson',
    '',
    '### What it is',
    '',
    'A program builds a **shell command** from text.',
    '',
    '### How an attack works',
    '',
    'An attacker names a branch.',
    extra,
    '### Trace',
    '',
    '```maple-trace',
    trace,
    '```',
    '',
    '### Quiz',
    '',
    '```maple-quiz',
    quiz,
    '```',
    '',
    '## Findings',
    '',
    '### 2026-11-12 MPL-340 F3: Branch name reaches the shell',
    '- PR: https://github.com/example/repo/pull/1',
    '- Code: `src/git.ts:4`',
    '',
    'The branch name goes into a shell string.',
    '',
    '### 2026-11-13 MPL-341 F1: Pending entry',
    '- PR: none yet',
    '- Code: `src/x.ts:1`',
    '',
  ].join('\n');
}

const FINDINGS = [
  {
    date: '2026-11-12',
    card: 'MPL-340',
    title: 'Branch name reaches the shell',
    pr: 'https://github.com/example/repo/pull/1',
    tieIn: 'The branch name goes into a shell string.',
  },
  { date: '2026-11-13', card: 'MPL-341', title: 'Pending entry', pr: null, tieIn: null },
];

function withSteps(count: number): string {
  const steps = Array.from({ length: count }, () => ({ lines: [1, 1], text: 'x' }));
  return JSON.stringify({ ...TRACE, steps });
}

describe('parseLesson', () => {
  test('a full lesson gives all parts', () => {
    // given
    const text = note();
    // when
    const { lesson, key } = parseLesson(PATH, text);
    // then
    expect(lesson).toMatchObject({
      summary: { path: PATH, title: 'Command injection', hasLesson: true },
      explanation: 'A program builds a **shell command** from text.',
      attack: 'An attacker names a branch.',
      trace: TRACE,
      traceError: null,
      quiz: QUIZ.questions.map(({ question, choices }) => ({ question, choices })),
      quizError: null,
      findings: FINDINGS,
    });
    expect(key).toEqual(QUIZ);
  });

  test('a ### Trace heading inside a code fence is ignored', () => {
    // given
    const text = note({ extra: '\n```md\n### Trace\nnot a trace\n```\n' });
    // when
    const { lesson } = parseLesson(PATH, text);
    // then
    expect(lesson.attack).toBe('An attacker names a branch.\n\n```md\n### Trace\nnot a trace\n```');
    expect(lesson.trace).toEqual(TRACE);
  });

  test.each([
    { name: 'bad trace JSON', trace: '{nope', error: 'reading lesson: trace: the block is not valid JSON' },
    {
      name: 'a step past the code',
      trace: JSON.stringify({ ...TRACE, steps: [TRACE.steps[0], { lines: [4, 6], text: 'x' }] }),
      error: 'reading lesson: trace: steps.1.lines: lines 4-6 are past the end of the code (5 lines)',
    },
    {
      name: '13 steps',
      trace: withSteps(13),
      error: 'reading lesson: trace: steps: has 13 items, want 2 to 12',
    },
  ])('$name gives a traceError while the rest parses', ({ trace, error }) => {
    // given
    const text = note({ trace });
    // when
    const { lesson, key } = parseLesson(PATH, text);
    // then
    expect(lesson.trace).toBeNull();
    expect(lesson.traceError).toBe(error);
    expect(lesson.quiz).toHaveLength(3);
    expect(lesson.explanation).not.toBeNull();
    expect(lesson.findings).toEqual(FINDINGS);
    expect(key).toEqual(QUIZ);
  });

  test('an answer out of range gives a quizError while the rest parses', () => {
    // given
    const questions = [...QUIZ.questions.slice(0, 2), { ...QUIZ.questions[2], answer: 3 }];
    const text = note({ quiz: JSON.stringify({ questions }) });
    // when
    const { lesson, key } = parseLesson(PATH, text);
    // then
    expect(lesson.quiz).toBeNull();
    expect(lesson.quizError).toBe(
      'reading lesson: quiz: questions.2.answer: answer 3 is not a choice index (3 choices)',
    );
    expect(lesson.trace).toEqual(TRACE);
    expect(key).toBeNull();
  });

  test('a missing quiz block gives a quizError', () => {
    // given
    const text = note().replace('```maple-quiz', '```json');
    // when
    const { lesson, key } = parseLesson(PATH, text);
    // then
    expect(lesson.quizError).toBe('reading lesson: quiz: found 0 maple-quiz blocks, want 1');
    expect(key).toBeNull();
  });

  test('the quiz returned has no answer or why', () => {
    // given
    const text = note();
    // when
    const { lesson } = parseLesson(PATH, text);
    // then
    expect(JSON.stringify(lesson)).not.toMatch(/"answer"|"why"/);
  });

  test('a note without a lesson is refused', () => {
    // given
    const text = '---\nstatus: to-learn\n---\n# XSS\n\n## Findings\n';
    // when
    const got = () => parseLesson(PATH, text);
    // then
    expect(got).toThrow(`reading lesson: ${PATH} is not a lesson note`);
  });
});
