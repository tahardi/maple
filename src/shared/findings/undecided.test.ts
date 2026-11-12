import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingDecision } from '@shared/types/findings/findingDecision';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { undecided } from './undecided';

const decided: FindingDecision = { kind: 'fix-now', reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };

function finding(id: string, decision: FindingDecision | null): Finding {
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
    applied: null,
    decision,
    severityOverride: null,
  };
}

function file(findings: Finding[]): FindingsFile {
  return {
    version: 1,
    card: 'MPL-1',
    round: 1,
    headSha: 'a'.repeat(40),
    updatedAt: '2026-11-12T12:00:00.000Z',
    resume: null,
    findings,
  };
}

describe('undecided', () => {
  test.each([
    { name: 'no file', file: null, want: 0 },
    { name: 'no findings', file: file([]), want: 0 },
    { name: 'two undecided findings', file: file([finding('F1', null), finding('F2', null)]), want: 2 },
    { name: 'one decided of two', file: file([finding('F1', decided), finding('F2', null)]), want: 1 },
    { name: 'all decided', file: file([finding('F1', decided)]), want: 0 },
  ])('counts $want for $name', ({ file: given, want }) => {
    // given
    // when
    const got = undecided(given);
    // then
    expect(got).toBe(want);
  });
});
