import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { StoredDecision } from './storedDecision';
import { findingFingerprint } from './findingFingerprint';
import { trustDecisions } from './trustDecisions';

const decision = { kind: 'accept-risk' as const, reason: 'local only', decidedAt: '2026-11-13T12:00:00.000Z' };
const identity = { kind: 'code' as const, class: 'xss', file: 'a.ts', hash: '0123456789abcdef' };

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F1',
    identity,
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
    decision: null,
    severityOverride: null,
    ...overrides,
  };
}

const fingerprint = findingFingerprint(finding());

function file(findings: Finding[]): FindingsFile {
  return { version: 1, card: 'MPL-1', round: 1, headSha: 'a', updatedAt: '', resume: null, findings };
}

describe('trustDecisions', () => {
  test.each<{ name: string; found: Finding; stored: StoredDecision[]; want: Finding }>([
    {
      name: 'ignores a decision and override Maple never recorded',
      found: finding({ decision, severityOverride: 'low' }),
      stored: [],
      want: finding(),
    },
    {
      name: 'uses the recorded decision and override',
      found: finding(),
      stored: [{ id: 'F1', identity, decision, severityOverride: 'low', fingerprint }],
      want: finding({ decision, severityOverride: 'low' }),
    },
    {
      name: 'ignores a record whose finding text changed',
      found: finding({ title: 'rewritten' }),
      stored: [{ id: 'F1', identity, decision, severityOverride: 'low', fingerprint }],
      want: finding({ title: 'rewritten' }),
    },
    {
      name: 'ignores a record saved before fingerprints',
      found: finding(),
      stored: [{ id: 'F1', identity, decision, severityOverride: 'low', fingerprint: null }],
      want: finding(),
    },
    {
      name: 'replaces a decision the file changed',
      found: finding({ decision: { ...decision, kind: 'not-real' } }),
      stored: [{ id: 'F1', identity, decision, severityOverride: null, fingerprint }],
      want: finding({ decision }),
    },
    {
      name: 'ignores a record whose finding now has another identity',
      found: finding({ identity: { ...identity, hash: 'fedcba9876543210' } }),
      stored: [{ id: 'F1', identity, decision, severityOverride: 'low', fingerprint }],
      want: finding({ identity: { ...identity, hash: 'fedcba9876543210' } }),
    },
    {
      name: 'ignores a record for another id',
      found: finding({ id: 'F2' }),
      stored: [{ id: 'F1', identity, decision, severityOverride: 'low', fingerprint }],
      want: finding({ id: 'F2' }),
    },
  ])('$name', ({ found, stored, want }) => {
    // given
    const read = file([found]);
    // when
    const got = trustDecisions(read, stored);
    // then
    expect(got).toEqual(file([want]));
  });
});
