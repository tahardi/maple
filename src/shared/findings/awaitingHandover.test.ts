import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingDecision } from '@shared/types/findings/findingDecision';
import { awaitingHandover } from './awaitingHandover';

const decision: FindingDecision = { kind: 'fix-now', reason: null, decidedAt: '2026-11-16T12:00:00.000Z' };
const applied = { at: '2026-11-16T12:30:00.000Z', commit: 'abc1234', cardKey: null };

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F1',
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
    decision: null,
    severityOverride: null,
    ...overrides,
  };
}

describe('awaitingHandover', () => {
  test.each([
    { name: 'a decided finding not handed over', given: finding({ decision, handedOver: false }), want: true },
    { name: 'a decided finding with no handover field', given: finding({ decision }), want: true },
    { name: 'an undecided finding', given: finding(), want: false },
    { name: 'a handed-over finding', given: finding({ decision, handedOver: true }), want: false },
    { name: 'a decided finding with applied', given: finding({ decision, applied }), want: false },
  ])('$name gives $want', ({ given, want }) => {
    // given
    // when
    const got = awaitingHandover(given);
    // then
    expect(got).toBe(want);
  });
});
