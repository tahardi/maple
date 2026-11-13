import { describe, expect, test } from 'vitest';
import type { FindingIdentity } from '@shared/types/findings/findingIdentity';
import { addFindingEntry, type FindingEntry } from './addFindingEntry';

const CODE: FindingIdentity = { kind: 'code', class: 'command-injection', file: 'src/a.ts', hash: 'h' };
const PR = 'https://github.com/tahardi/maple/pull/7';

function entry(fields: Partial<FindingEntry> = {}): FindingEntry {
  return { key: 'MPL-1', id: 'F3', identity: CODE, line: 12, title: 'Shell gets the branch name', pr: PR, ...fields };
}

const NEW =
  '---\nclass: command-injection\nstatus: to-learn\ncomfortable: false\ngrades: []\n---\n' +
  '# Command injection\n\n## Findings\n\n' +
  `### 2026-11-13 MPL-1 F3: Shell gets the branch name\n- PR: ${PR}\n- Code: \`src/a.ts:12\`\n`;

const EXISTING =
  '---\nclass: command-injection\nstatus: learned\ncomfortable: true\ngrades: []\n---\n' +
  '# Command injection\n\n## Lesson\n### What it is\nText\n\n## Findings\n\n' +
  '### 2026-11-12 MPL-1 F1: Old one\n- PR: none yet\n- Code: `src/b.ts`\n\nTie-in.\n';

describe('addFindingEntry', () => {
  test.each<{ name: string; text: string | null; entry: FindingEntry; want: string }>([
    { name: 'a new note gets frontmatter, title, Findings, and the entry', text: null, entry: entry(), want: NEW },
    {
      name: 'an existing note gets the entry at the end',
      text: EXISTING,
      entry: entry(),
      want: `${EXISTING}\n### 2026-11-13 MPL-1 F3: Shell gets the branch name\n- PR: ${PR}\n- Code: \`src/a.ts:12\`\n`,
    },
    { name: 'the same key and id adds nothing', text: NEW, entry: entry({ title: 'Renamed' }), want: NEW },
    {
      name: 'a two-line title becomes one line',
      text: null,
      entry: entry({ title: 'Shell gets\n  the branch name' }),
      want: NEW,
    },
    {
      name: 'no PR gives none yet',
      text: null,
      entry: entry({ pr: null }),
      want: NEW.replace(`- PR: ${PR}`, '- PR: none yet'),
    },
    {
      name: 'a dependency finding names the package and advisory',
      text: null,
      entry: entry({ identity: { kind: 'dependency', advisory: 'GHSA-xxxx', package: 'lodash' }, line: null }),
      want: NEW.replace('class: command-injection', 'class: vulnerable-dependency')
        .replace('# Command injection', '# Vulnerable dependency')
        .replace('`src/a.ts:12`', '`lodash GHSA-xxxx`'),
    },
    {
      name: 'a code finding with no line names the file',
      text: null,
      entry: entry({ line: null }),
      want: NEW.replace('`src/a.ts:12`', '`src/a.ts`'),
    },
    {
      name: 'a note with no Findings heading gets one',
      text: '# Command injection\n',
      entry: entry(),
      want: `# Command injection\n\n## Findings\n\n### 2026-11-13 MPL-1 F3: Shell gets the branch name\n- PR: ${PR}\n- Code: \`src/a.ts:12\`\n`,
    },
  ])('$name', ({ text, entry: given, want }) => {
    // given
    const note = text;
    // when
    const got = addFindingEntry(note, given, '2026-11-13');
    // then
    expect(got).toBe(want);
  });

  test('caps the title at 120 characters', () => {
    // given
    const title = 'x'.repeat(200);
    // when
    const got = addFindingEntry(null, entry({ title }), '2026-11-13');
    // then
    expect(got).toContain(`### 2026-11-13 MPL-1 F3: ${'x'.repeat(120)}\n`);
  });
});
