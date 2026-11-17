import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { DecisionInput } from '@shared/types/findings/decisionInput';
import { applyDecision, applyOverride } from './applyDecision';

const NOW = '2026-11-12T13:00:00.000Z';

function finding(id: string, overrides: Partial<Finding> = {}): Finding {
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
    decision: null,
    severityOverride: null,
    ...overrides,
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

const applied = { at: '2026-11-12T12:30:00.000Z', commit: 'abc1234', cardKey: null };

describe('applyDecision', () => {
  test.each<{ name: string; input: DecisionInput }>([
    { name: 'fix now', input: { kind: 'fix-now', reason: null } },
    { name: 'fix later', input: { kind: 'fix-later', reason: null } },
    { name: 'accept risk', input: { kind: 'accept-risk', reason: 'Only Taylor runs this' } },
    { name: 'not real', input: { kind: 'not-real', reason: null } },
  ])('$name sets the decision with decidedAt', ({ input }) => {
    // given
    const given = file([finding('F1')]);
    // when
    const got = applyDecision(given, 'F1', input, NOW);
    // then
    expect(got.findings[0].decision).toEqual({ ...input, decidedAt: NOW });
  });

  test('null clears the decision', () => {
    // given
    const given = file([finding('F1', { decision: { kind: 'fix-now', reason: null, decidedAt: NOW } })]);
    // when
    const got = applyDecision(given, 'F1', null, NOW);
    // then
    expect(got.findings[0].decision).toBeNull();
  });

  test('changes only the target finding', () => {
    // given
    const given = file([finding('F1'), finding('F2'), finding('F3')]);
    // when
    const got = applyDecision(given, 'F2', { kind: 'not-real', reason: null }, NOW);
    // then
    expect(got).toEqual({
      ...given,
      findings: [
        given.findings[0],
        { ...given.findings[1], decision: { kind: 'not-real', reason: null, decidedAt: NOW } },
        given.findings[2],
      ],
    });
  });

  test.each<{ name: string; given: FindingsFile; id: string; input: DecisionInput; error: string }>([
    {
      name: 'accept risk without a reason',
      given: file([finding('F1')]),
      id: 'F1',
      input: { kind: 'accept-risk', reason: null },
      error: 'deciding finding: accept risk needs a reason',
    },
    {
      name: 'accept risk with a blank reason',
      given: file([finding('F1')]),
      id: 'F1',
      input: { kind: 'accept-risk', reason: '   ' },
      error: 'deciding finding: accept risk needs a reason',
    },
    {
      name: 'an unknown id',
      given: file([finding('F1')]),
      id: 'F3',
      input: { kind: 'fix-now', reason: null },
      error: 'deciding finding: no finding F3 on MPL-1',
    },
    {
      name: 'an applied finding',
      given: file([finding('F1', { applied })]),
      id: 'F1',
      input: { kind: 'fix-now', reason: null },
      error: 'deciding finding: F1 is already applied',
    },
  ])('throws for $name', ({ given, id, input, error }) => {
    // given
    // when
    const run = () => applyDecision(given, id, input, NOW);
    // then
    expect(run).toThrow(error);
  });
});

describe('applyOverride', () => {
  test.each([{ severity: 'low' as const }, { severity: 'medium' as const }, { severity: null }])(
    'sets the override to $severity on the target finding only',
    ({ severity }) => {
      // given
      const given = file([finding('F1', { severityOverride: 'medium' }), finding('F2')]);
      // when
      const got = applyOverride(given, 'F1', severity);
      // then
      expect(got.findings).toEqual([{ ...given.findings[0], severityOverride: severity }, given.findings[1]]);
    },
  );

  test.each([
    { name: 'an unknown id', given: file([finding('F1')]), error: 'overriding severity: no finding F2 on MPL-1' },
    {
      name: 'an applied finding',
      given: file([finding('F2', { applied })]),
      error: 'overriding severity: F2 is already applied',
    },
  ])('throws for $name', ({ given, error }) => {
    // given
    // when
    const run = () => applyOverride(given, 'F2', 'low');
    // then
    expect(run).toThrow(error);
  });
});
