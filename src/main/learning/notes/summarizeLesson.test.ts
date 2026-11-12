import { describe, expect, test } from 'vitest';
import { summarizeLesson } from './summarizeLesson';

const PATH = 'Learning/Security/command-injection.md';

const DEFAULTS = {
  path: PATH,
  slug: 'command-injection',
  title: 'command-injection',
  status: 'to-learn',
  comfortable: false,
  lastGrade: null,
  findings: 0,
  hasLesson: false,
  error: null,
};

const FULL =
  '---\nclass: command-injection\nstatus: learned\ncomfortable: true\ngrades:\n' +
  '  - { date: 2026-11-10, score: 2, total: 5 }\n  - { date: 2026-11-12, score: 4, total: 5 }\n---\n\n' +
  '# Command injection\n\n## Lesson\n### What it is\nText\n\n## Findings\n' +
  '### 2026-11-12 MPL-340 F3: Shell gets the branch name\n- PR: none yet\n\n' +
  '### 2026-11-12 MPL-341 F1: Another\n- PR: none yet\n### not an entry\n';

describe('summarizeLesson', () => {
  test.each([
    { name: 'defaults with no frontmatter or headings', text: 'plain text\n', want: DEFAULTS },
    {
      name: 'reads status, comfortable, last grade, title, findings, and lesson',
      text: FULL,
      want: {
        ...DEFAULTS,
        title: 'Command injection',
        status: 'learned',
        comfortable: true,
        lastGrade: { date: '2026-11-12', score: 4, total: 5 },
        findings: 2,
        hasLesson: true,
      },
    },
    {
      name: 'title falls back to the slug without a top heading',
      text: '## Findings\n',
      want: DEFAULTS,
    },
    {
      name: 'ignores entry headings outside the Findings section',
      text: '# T\n\n### 2026-11-12 MPL-340 F3: Not here\n\n## Findings\n### 2026-11-12 MPL-340 F4: Here\n',
      want: { ...DEFAULTS, title: 'T', findings: 1 },
    },
    {
      name: 'ignores unknown status and malformed grades',
      text: '---\nstatus: mastered\ncomfortable: yes\ngrades: [{ date: 2026-11-12 }]\n---\n# T\n',
      want: { ...DEFAULTS, title: 'T' },
    },
    {
      name: 'gives an error for bad YAML',
      text: '---\nstatus: [learned\n---\n# T\n',
      want: { ...DEFAULTS, title: 'T', error: expect.stringMatching(/^reading frontmatter: /) as unknown },
    },
  ])('$name', ({ text, want }) => {
    // given
    const note = text;
    // when
    const got = summarizeLesson(PATH, note);
    // then
    expect(got).toEqual(want);
  });
});
