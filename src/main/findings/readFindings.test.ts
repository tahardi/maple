import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readFindings } from './readFindings';

function finding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'F1',
    identity: { kind: 'code', class: 'command-injection', file: 'src/main/x.ts', hash: '0123456789abcdef' },
    line: 42,
    severity: 'high',
    sources: ['security-pass'],
    title: 'Branch name reaches a shell',
    what: 'A branch name is put into a shell command.',
    how: 'Someone who names a branch can run commands.',
    impact: 'They could read the Jira token.',
    defense: 'Pass arguments as an array.',
    chips: ['runs-code', 'leaks-credentials'],
    applied: null,
    decision: null,
    severityOverride: null,
    ...overrides,
  };
}

function file(findings: Record<string, unknown>[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    card: 'MPL-1',
    round: 1,
    headSha: 'a'.repeat(40),
    updatedAt: '2026-11-12T12:00:00.000Z',
    resume: null,
    findings,
    ...overrides,
  };
}

describe('readFindings', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-findings-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('returns null when the file is missing', async () => {
    // given
    // when
    const got = await readFindings(dir, 'MPL-1');
    // then
    expect(got).toBeNull();
  });

  test.each([
    { name: 'a valid version 1 file', content: file([finding()]), want: file([finding()]) },
    {
      name: 'a file with a decided, overridden finding',
      content: file([
        finding({
          decision: { kind: 'accept-risk', reason: 'local only', decidedAt: '2026-11-12T12:00:00.000Z' },
          severityOverride: 'low',
          lesson: { note: 'Learning/Security/command-injection.md', mode: 'later', at: '2026-11-12T12:00:00.000Z' },
        }),
      ]),
      want: file([
        finding({
          decision: { kind: 'accept-risk', reason: 'local only', decidedAt: '2026-11-12T12:00:00.000Z' },
          severityOverride: 'low',
          lesson: { note: 'Learning/Security/command-injection.md', mode: 'later', at: '2026-11-12T12:00:00.000Z' },
        }),
      ]),
    },
    {
      name: 'a dependency finding',
      content: file([
        finding({ identity: { kind: 'dependency', advisory: 'GHSA-1234-5678-9abc', package: 'lodash' } }),
      ]),
      want: file([finding({ identity: { kind: 'dependency', advisory: 'GHSA-1234-5678-9abc', package: 'lodash' } })]),
    },
    {
      name: 'an unknown chip id, which is dropped',
      content: file([finding({ chips: ['costs-money', 'melts-laptop'] })]),
      want: file([finding({ chips: ['costs-money'] })]),
    },
    {
      name: 'an unknown visual object, which passes through',
      content: file([finding({ visual: { someday: [1, 2] } })]),
      want: file([finding({ visual: { someday: [1, 2] } })]),
    },
  ])('reads $name', async ({ content, want }) => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify(content));
    // when
    const got = await readFindings(dir, 'MPL-1');
    // then
    expect(got).toEqual(want);
  });

  test.each([
    {
      name: 'a newer version',
      content: JSON.stringify(file([], { version: 2 })),
      want: /^reading findings: MPL-1\.json is from a newer Maple$/,
    },
    {
      name: 'bad JSON, without echoing the file',
      content: 'JIRA_TOKEN=secret-value',
      want: /^reading findings: MPL-1\.json: not valid JSON$/,
    },
    {
      name: 'a failed schema',
      content: JSON.stringify(file([], { round: 'two' })),
      want: /^reading findings: MPL-1\.json: .*round/,
    },
    {
      name: 'a low severity',
      content: JSON.stringify(file([finding({ severity: 'low' })])),
      want: /^reading findings: MPL-1\.json: .*severity/,
    },
    {
      name: 'a prose field over 2000 characters',
      content: JSON.stringify(file([finding({ what: 'x'.repeat(2001) })])),
      want: /^reading findings: MPL-1\.json: .*what/,
    },
  ])('throws on $name', async ({ content, want }) => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), content);
    // when
    const read = readFindings(dir, 'MPL-1');
    // then
    await expect(read).rejects.toThrow(want);
  });

  test.each([
    {
      name: 'a symlink',
      make: async (path: string) => {
        await writeFile(join(dir, 'secret.json'), '{}');
        await symlink(join(dir, 'secret.json'), path);
      },
    },
    {
      name: 'a folder',
      make: async (path: string) => {
        await mkdir(path);
      },
    },
  ])('throws on $name in place of the file', async ({ make }) => {
    // given
    await make(join(dir, 'MPL-1.json'));
    // when
    const read = readFindings(dir, 'MPL-1');
    // then
    await expect(read).rejects.toThrow('reading findings: MPL-1.json is not a regular file');
  });

  test.each(['../MPL-1', 'mpl-1', 'MPL-1.json', 'MPL-'])('throws on the bad card key %s', async (key) => {
    // given
    // when
    const read = readFindings(dir, key);
    // then
    await expect(read).rejects.toThrow(`reading findings: bad card key ${key}`);
  });
});
