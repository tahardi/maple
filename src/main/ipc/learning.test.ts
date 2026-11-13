import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { IpcDeps } from './index';
import { registerLearning } from './learning';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle } }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const NOTE = '---\nclass: xss\ncomfortable: false\naliases: [a, b]\n---\n# XSS\n\n## Findings\n';

const QUIZ = {
  questions: [
    { question: 'A?', choices: ['a', 'b'], answer: 0, why: 'Because a.' },
    { question: 'B?', choices: ['a', 'b'], answer: 1, why: 'Because b.' },
    { question: 'C?', choices: ['a', 'b'], answer: 0, why: 'Because c.' },
  ],
};

const TRACE = {
  lang: 'typescript',
  code: 'const a = 1\nconst b = a',
  steps: [
    { lines: [1, 1], text: 'One.' },
    { lines: [2, 2], text: 'Two.' },
  ],
};

const LESSON_BODY = [
  '# Command injection',
  '',
  '## Lesson',
  '',
  '### What it is',
  '',
  'Text.',
  '',
  '### Trace',
  '',
  '```maple-trace',
  JSON.stringify(TRACE),
  '```',
  '',
  '### Quiz',
  '',
  '```maple-quiz',
  JSON.stringify(QUIZ),
  '```',
  '',
  '## Findings',
  '',
].join('\n');

const LESSON = `---\nclass: command-injection\nstatus: to-learn\ncomfortable: false\ngrades: []\n---\n${LESSON_BODY}`;

const LESSON_PATH = 'Learning/Security/command-injection.md';

function register(vaultDir: string | null) {
  const watchVault = vi.fn<(dir: string) => void>();
  registerLearning({ watchVault } as unknown as IpcDeps, logger, () => Promise.resolve(vaultDir));
  const invoke = (channel: string, ...args: unknown[]): unknown => {
    const call = handle.mock.calls.findLast(([name]) => name === channel);
    if (!call) {
      throw new Error(`finding handler: ${channel} is not registered`);
    }
    return call[1]({} as IpcMainInvokeEvent, ...args);
  };
  return { invoke, watchVault };
}

describe('registerLearning', () => {
  let vault = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vault = mkdtempSync(join(tmpdir(), 'maple-learning-'));
    mkdirSync(join(vault, 'Learning', 'Security'), { recursive: true });
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), NOTE);
    writeFileSync(join(vault, 'Inbox.md'), NOTE);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(vault, { recursive: true, force: true });
  });

  test('learning:list returns summaries', async () => {
    // given
    const { invoke, watchVault } = register(vault);
    // when
    const got = await invoke('learning:list');
    // then
    expect(got).toEqual([
      {
        path: 'Learning/Security/xss.md',
        slug: 'xss',
        title: 'XSS',
        status: 'to-learn',
        comfortable: false,
        lastGrade: null,
        findings: 0,
        hasLesson: false,
        error: null,
      },
    ]);
    expect(watchVault).toHaveBeenCalledWith(vault);
  });

  test('learning:setComfortable writes the flag and keeps the rest of the note', async () => {
    // given
    const { invoke } = register(vault);
    // when
    await invoke('learning:setComfortable', 'Learning/Security/xss.md', true);
    // then
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(
      NOTE.replace('comfortable: false', 'comfortable: true'),
    );
  });

  test('learning:setComfortable can unmark a note', async () => {
    // given
    const marked = NOTE.replace('comfortable: false', 'comfortable: true');
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), marked);
    const { invoke } = register(vault);
    // when
    await invoke('learning:setComfortable', 'Learning/Security/xss.md', false);
    // then
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(NOTE);
  });

  test('learning:setComfortable leaves a note with bad YAML unchanged', async () => {
    // given
    const bad = '---\nstatus: [x\n---\n# XSS\n';
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), bad);
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:setComfortable', 'Learning/Security/xss.md', true);
    // then
    await expect(got).rejects.toThrow(/^writing frontmatter: /);
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(bad);
  });

  test('learning:setComfortable creates nothing for a missing note', async () => {
    // given
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:setComfortable', 'Learning/Security/gone.md', true);
    // then
    await expect(got).rejects.toThrow('ENOENT');
    expect(existsSync(join(vault, 'Learning', 'Security', 'gone.md'))).toBe(false);
  });

  test.each(['Inbox.md', '../x.md', 'Learning/Security/../../Inbox.md'])(
    'learning:setComfortable refuses a path outside Learning/Security: %s',
    async (path) => {
      // given
      const { invoke } = register(vault);
      // when
      const got = invoke('learning:setComfortable', path, true);
      // then
      await expect(got).rejects.toThrow(`marking comfortable: ${path} is not a lesson note`);
      expect(readFileSync(join(vault, 'Inbox.md'), 'utf8')).toBe(NOTE);
    },
  );

  test('learning:read returns the lesson without the answer key', async () => {
    // given
    writeFileSync(join(vault, LESSON_PATH), LESSON);
    const { invoke } = register(vault);
    // when
    const got = await invoke('learning:read', LESSON_PATH);
    // then
    expect(got).toMatchObject({
      summary: { path: LESSON_PATH, title: 'Command injection' },
      explanation: 'Text.',
      trace: TRACE,
      quiz: QUIZ.questions.map(({ question, choices }) => ({ question, choices })),
    });
    expect(JSON.stringify(got)).not.toMatch(/"answer"|"why"/);
  });

  test('learning:read refuses a note with no lesson', async () => {
    // given
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:read', 'Learning/Security/xss.md');
    // then
    await expect(got).rejects.toThrow('reading lesson: Learning/Security/xss.md is not a lesson note');
  });

  test('learning:grade appends a dated grade and sets status learned, keeping the rest of the note', async () => {
    // given
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13, 9));
    writeFileSync(join(vault, LESSON_PATH), LESSON);
    const { invoke } = register(vault);
    // when
    const got = await invoke('learning:grade', LESSON_PATH, [0, 0, 0]);
    // then
    expect(got).toEqual({
      score: 2,
      total: 3,
      results: [
        { correct: true, answer: 0, why: 'Because a.' },
        { correct: false, answer: 1, why: 'Because b.' },
        { correct: true, answer: 0, why: 'Because c.' },
      ],
    });
    expect(readFileSync(join(vault, LESSON_PATH), 'utf8')).toBe(
      '---\nclass: command-injection\nstatus: learned\ncomfortable: false\ngrades:\n' +
        '  - date: 2026-11-13\n    score: 2\n    total: 3\n---\n' +
        LESSON_BODY,
    );
  });

  test('learning:grade twice keeps both grades', async () => {
    // given
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13, 9));
    writeFileSync(join(vault, LESSON_PATH), LESSON);
    const { invoke } = register(vault);
    await invoke('learning:grade', LESSON_PATH, [0, 0, 0]);
    vi.setSystemTime(new Date(2026, 10, 14, 9));
    // when
    await invoke('learning:grade', LESSON_PATH, [0, 1, 0]);
    // then
    const list = (await invoke('learning:list')) as { path: string; lastGrade: unknown; status: string }[];
    expect(list.find((l) => l.path === LESSON_PATH)).toMatchObject({
      status: 'learned',
      lastGrade: { date: '2026-11-14', score: 3, total: 3 },
    });
    expect(readFileSync(join(vault, LESSON_PATH), 'utf8')).toContain(
      'grades:\n  - date: 2026-11-13\n    score: 2\n    total: 3\n  - date: 2026-11-14\n    score: 3\n    total: 3\n',
    );
  });

  test('learning:grade refuses a note with no quiz', async () => {
    // given
    const noQuiz = LESSON.replace('```maple-quiz', '```json');
    writeFileSync(join(vault, LESSON_PATH), noQuiz);
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:grade', LESSON_PATH, [0, 0, 0]);
    // then
    await expect(got).rejects.toThrow(`grading quiz: ${LESSON_PATH} has no quiz`);
    expect(readFileSync(join(vault, LESSON_PATH), 'utf8')).toBe(noQuiz);
  });

  test('learning:grade refuses the wrong number of answers and leaves the note unchanged', async () => {
    // given
    writeFileSync(join(vault, LESSON_PATH), LESSON);
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:grade', LESSON_PATH, [0, 0]);
    // then
    await expect(got).rejects.toThrow('grading quiz: expected 3 answers, got 2');
    expect(readFileSync(join(vault, LESSON_PATH), 'utf8')).toBe(LESSON);
  });

  test.each([
    { name: 'no grades key', frontmatter: 'class: command-injection\nstatus: to-learn\n' },
    { name: 'grades that are not a list', frontmatter: 'class: command-injection\nstatus: to-learn\ngrades: oops\n' },
  ])('learning:grade starts a grades list for a note with $name', async ({ frontmatter }) => {
    // given
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13, 9));
    writeFileSync(join(vault, LESSON_PATH), `---\n${frontmatter}---\n${LESSON_BODY}`);
    const { invoke } = register(vault);
    // when
    await invoke('learning:grade', LESSON_PATH, [0, 1, 0]);
    // then
    const list = (await invoke('learning:list')) as { path: string; lastGrade: unknown; status: string }[];
    expect(list.find((l) => l.path === LESSON_PATH)).toMatchObject({
      status: 'learned',
      lastGrade: { date: '2026-11-13', score: 3, total: 3 },
    });
    expect(readFileSync(join(vault, LESSON_PATH), 'utf8')).toContain(
      'grades:\n  - date: 2026-11-13\n    score: 3\n    total: 3\n---\n',
    );
  });

  test.each([
    { channel: 'learning:read', args: ['Inbox.md'] },
    { channel: 'learning:grade', args: ['../x.md', [0]] },
    { channel: 'learning:grade', args: [LESSON_PATH, []] },
    { channel: 'learning:grade', args: [LESSON_PATH, [0, 0, 0, 0, 0, 0]] },
    { channel: 'learning:grade', args: [LESSON_PATH, [0.5]] },
    { channel: 'learning:grade', args: [LESSON_PATH, [-1]] },
  ])('$channel rejects bad arguments: $args', async ({ channel, args }) => {
    // given
    writeFileSync(join(vault, LESSON_PATH), LESSON);
    const { invoke } = register(vault);
    // when
    const got = Promise.resolve().then(() => invoke(channel, ...args));
    // then
    await expect(got).rejects.toThrow(`handling ${channel}: arguments are invalid`);
    expect(readFileSync(join(vault, LESSON_PATH), 'utf8')).toBe(LESSON);
  });

  test.each([
    { channel: 'learning:list', args: [] },
    { channel: 'learning:read', args: [LESSON_PATH] },
    { channel: 'learning:grade', args: [LESSON_PATH, [0, 0, 0]] },
    { channel: 'learning:setComfortable', args: ['Learning/Security/xss.md', true] },
  ])('$channel rejects and logs without a vaultDir', async ({ channel, args }) => {
    // given
    const { invoke } = register(null);
    // when
    const got = invoke(channel, ...args);
    // then
    await expect(got).rejects.toThrow('reading lessons: no vaultDir in config');
    expect(logger.warn).toHaveBeenCalledWith('learning', 'failed', expect.objectContaining({ operation: channel }));
  });
});
