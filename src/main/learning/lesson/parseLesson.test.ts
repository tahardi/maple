import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

function withTrace(fields: Record<string, unknown>): string {
  return JSON.stringify({ ...TRACE, ...fields });
}

function withQuestion(fields: Record<string, unknown>): string {
  return JSON.stringify({ questions: [{ ...QUIZ.questions[0], ...fields }, ...QUIZ.questions.slice(1)] });
}

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
    { name: '1 step', trace: withSteps(1), error: 'reading lesson: trace: steps: has 1 items, want 2 to 12' },
    {
      name: 'a 41-character lang',
      trace: withTrace({ lang: 'x'.repeat(41) }),
      error: 'reading lesson: trace: lang: is 41 characters, want at most 40',
    },
    { name: 'a blank lang', trace: withTrace({ lang: ' ' }), error: 'reading lesson: trace: lang: is missing' },
    {
      name: 'an empty step text',
      trace: withTrace({ steps: [{ lines: [1, 1], text: '' }, TRACE.steps[1]] }),
      error: 'reading lesson: trace: steps.0.text: is missing',
    },
    {
      name: 'a 601-character step text',
      trace: withTrace({ steps: [{ lines: [1, 1], text: 'x'.repeat(601) }, TRACE.steps[1]] }),
      error: 'reading lesson: trace: steps.0.text: is 601 characters, want at most 600',
    },
    {
      name: 'lines starting at 0',
      trace: withTrace({ steps: [{ lines: [0, 1], text: 'x' }, TRACE.steps[1]] }),
      error: 'reading lesson: trace: steps.0.lines: lines 0-1 are not a 1-based range',
    },
    {
      name: 'lines out of order',
      trace: withTrace({ steps: [{ lines: [3, 2], text: 'x' }, TRACE.steps[1]] }),
      error: 'reading lesson: trace: steps.0.lines: lines 3-2 are not a 1-based range',
    },
    {
      name: 'code of 61 lines',
      trace: withTrace({ code: Array.from({ length: 61 }, () => 'x').join('\n') }),
      error: 'reading lesson: trace: code: is 61 lines, want at most 60',
    },
    {
      name: 'code over 4000 characters',
      trace: withTrace({ code: 'x'.repeat(4001) }),
      error: 'reading lesson: trace: code: is 4001 characters, want at most 4000',
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

  test.each([
    {
      name: 'an answer out of range',
      quiz: withQuestion({ answer: 2 }),
      error: 'reading lesson: quiz: questions.0.answer: answer 2 is not a choice index (2 choices)',
    },
    {
      name: 'a negative answer',
      quiz: withQuestion({ answer: -1 }),
      error: 'reading lesson: quiz: questions.0.answer: answer -1 is not a choice index (2 choices)',
    },
    {
      name: '2 questions',
      quiz: JSON.stringify({ questions: QUIZ.questions.slice(0, 2) }),
      error: 'reading lesson: quiz: questions: has 2 items, want 3 to 5',
    },
    {
      name: '6 choices',
      quiz: withQuestion({ choices: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      error: 'reading lesson: quiz: questions.0.choices: has 6 items, want 2 to 5',
    },
    {
      name: 'an empty choice',
      quiz: withQuestion({ choices: ['', 'b'] }),
      error: 'reading lesson: quiz: questions.0.choices.0: is missing',
    },
    {
      name: 'a 301-character question',
      quiz: withQuestion({ question: 'x'.repeat(301) }),
      error: 'reading lesson: quiz: questions.0.question: is 301 characters, want at most 300',
    },
    {
      name: 'a missing why',
      quiz: withQuestion({ why: '' }),
      error: 'reading lesson: quiz: questions.0.why: is missing',
    },
    { name: 'bad quiz JSON', quiz: '[', error: 'reading lesson: quiz: the block is not valid JSON' },
  ])('$name gives a quizError while the rest parses', ({ quiz, error }) => {
    // given
    const text = note({ quiz });
    // when
    const { lesson, key } = parseLesson(PATH, text);
    // then
    expect(lesson.quiz).toBeNull();
    expect(lesson.quizError).toBe(error);
    expect(lesson.trace).toEqual(TRACE);
    expect(lesson.findings).toEqual(FINDINGS);
    expect(key).toBeNull();
  });

  test.each([
    { name: 'a missing quiz block', text: note().replace('```maple-quiz', '```json'), error: 'found 0' },
    {
      name: 'two quiz blocks',
      text: note({ extra: `\n\`\`\`maple-quiz\n${JSON.stringify(QUIZ)}\n\`\`\`\n` }),
      error: 'found 2',
    },
  ])('$name gives a quizError', ({ text, error }) => {
    // given
    const source = text;
    // when
    const { lesson, key } = parseLesson(PATH, source);
    // then
    expect(lesson.quizError).toBe(`reading lesson: quiz: ${error} maple-quiz blocks, want 1`);
    expect(key).toBeNull();
  });

  test('two trace blocks give a traceError', () => {
    // given
    const text = note({ extra: `\n\`\`\`maple-trace\n${JSON.stringify(TRACE)}\n\`\`\`\n` });
    // when
    const { lesson } = parseLesson(PATH, text);
    // then
    expect(lesson.traceError).toBe('reading lesson: trace: found 2 maple-trace blocks, want 1');
  });

  test('a longer fence is not closed by a three-backtick line inside it', () => {
    // given
    const text = note({ extra: '\n````md\n```\n## Findings\n### 2026-01-01 MPL-1 F1: Fake\n````\n' });
    // when
    const { lesson } = parseLesson(PATH, text);
    // then
    expect(lesson.attack).toBe(
      'An attacker names a branch.\n\n````md\n```\n## Findings\n### 2026-01-01 MPL-1 F1: Fake\n````',
    );
    expect(lesson.trace).toEqual(TRACE);
    expect(lesson.findings).toEqual(FINDINGS);
  });

  test("parses the Learn skill's sample note with no errors", () => {
    // given
    const text = readFileSync(join(import.meta.dirname, '../../../../test/fixtures/learning/lesson_ok.md'), 'utf8');
    // when
    const { lesson, key } = parseLesson(PATH, text);
    // then
    expect(lesson).toMatchObject({ traceError: null, quizError: null });
    expect(lesson.trace?.steps).toHaveLength(2);
    expect(lesson.quiz).toHaveLength(3);
    expect(key?.questions).toHaveLength(3);
    expect(lesson.findings).toEqual([
      {
        date: '2026-11-12',
        card: 'MPL-340',
        title: 'Branch name reaches the shell',
        pr: 'https://github.com/example/repo/pull/1',
        tieIn: expect.stringMatching(/^The branch name goes into a shell string/) as unknown,
      },
    ]);
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
