import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { StoredDecision } from './storedDecision';
import { findingFingerprint } from './findingFingerprint';
import { recordsOf } from './recordsOf';

const decision = { kind: 'fix-later' as const, reason: null, decidedAt: '2026-11-16T12:00:00.000Z' };
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

function file(findings: Finding[]): FindingsFile {
  return { version: 1, card: 'MPL-1', round: 1, headSha: 'a', updatedAt: '', resume: null, findings };
}

const fingerprint = findingFingerprint(finding());

describe('recordsOf', () => {
  test.each<{ name: string; given: Finding; want: StoredDecision[] }>([
    {
      name: 'keeps a decided finding with its handover',
      given: finding({ decision, handedOver: true }),
      want: [{ id: 'F1', identity, decision, severityOverride: null, fingerprint, handedOver: true }],
    },
    {
      name: 'keeps a finding with only a severity override',
      given: finding({ severityOverride: 'low' }),
      want: [{ id: 'F1', identity, decision: null, severityOverride: 'low', fingerprint, handedOver: false }],
    },
    { name: 'drops a finding with no decision or override', given: finding(), want: [] },
  ])('$name', ({ given, want }) => {
    // given
    const read = file([given]);
    // when
    const got = recordsOf(read);
    // then
    expect(got).toEqual(want);
  });
});
