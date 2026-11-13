import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingDecision } from '@shared/types/findings/findingDecision';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { resumeDue } from './resumeDue';

const decided: FindingDecision = { kind: 'fix-now', reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };
const applied = { at: '2026-11-12T13:00:00.000Z', commit: 'abc1234', cardKey: null };

function finding(id: string, decision: FindingDecision | null, done = false): Finding {
  return {
    id,
    identity: { kind: 'code', class: 'xss', file: 'a.ts', hash: '0123456789abcdef' },
    line: 1,
    severity: 'high',
    sources: [],
    title: 't',
    what: '',
    how: '',
    impact: '',
    defense: '',
    chips: [],
    applied: done ? applied : null,
    decision,
    severityOverride: null,
  };
}

function file(findings: Finding[], resume: FindingsFile['resume'] = null): FindingsFile {
  return {
    version: 1,
    card: 'MPL-1',
    round: 2,
    headSha: 'a'.repeat(40),
    updatedAt: '2026-11-12T12:00:00.000Z',
    resume,
    findings,
  };
}

describe('resumeDue', () => {
  test.each([
    { name: 'no file', file: null, want: false },
    { name: 'no findings', file: file([]), want: false },
    { name: 'one undecided', file: file([finding('F1', decided), finding('F2', null)]), want: false },
    {
      name: 'all decided with one unapplied',
      file: file([finding('F1', decided, true), finding('F2', decided)]),
      want: true,
    },
    { name: 'all applied', file: file([finding('F1', decided, true), finding('F2', decided, true)]), want: false },
    {
      name: 'resume already sent for this round',
      file: file([finding('F1', decided)], { round: 2, sentAt: '2026-11-12T14:00:00.000Z' }),
      want: false,
    },
    {
      name: 'resume sent for an earlier round',
      file: file([finding('F1', decided)], { round: 1, sentAt: '2026-11-12T14:00:00.000Z' }),
      want: true,
    },
  ])('is $want for $name', ({ file: given, want }) => {
    // given
    // when
    const got = resumeDue(given);
    // then
    expect(got).toBe(want);
  });
});
