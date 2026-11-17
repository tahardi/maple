import { describe, expect, test } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import { findingFingerprint } from './findingFingerprint';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F1',
    identity: { kind: 'code', class: 'command-injection', file: 'src/main/x.ts', hash: '0123456789abcdef' },
    line: 42,
    severity: 'high',
    sources: ['security-pass'],
    title: 'Branch name reaches a shell',
    what: 'A branch name is pasted into a command — café',
    how: 'Anyone who can push a branch',
    impact: 'Runs code',
    defense: 'Quote it',
    chips: ['runs-code', 'leaks-credentials'],
    visual: {
      path: [
        { actor: 'a stranger', step: 'Names a branch.', zone: 'GitHub' },
        { actor: 'Maple', step: 'Runs git.', zone: 'Maple app', crosses: 'the branch name' },
      ],
      reach: { now: ['Run any command.'], afterFix: [] },
    },
    applied: null,
    decision: null,
    severityOverride: null,
    ...overrides,
  };
}

describe('findingFingerprint', () => {
  test('gives the same 64-character hex for the same judged fields', () => {
    // given
    const a = finding();
    const b = finding();
    // when
    const got = findingFingerprint(a);
    // then
    expect(got).toMatch(/^[0-9a-f]{64}$/);
    expect(findingFingerprint(b)).toBe(got);
  });

  test.each<{ field: string; change: Partial<Finding> }>([
    { field: 'severity', change: { severity: 'medium' } },
    { field: 'title', change: { title: 'Other title' } },
    { field: 'headline', change: { headline: 'Anyone can run commands.' } },
    { field: 'what', change: { what: 'other' } },
    { field: 'how', change: { how: 'other' } },
    { field: 'impact', change: { impact: 'other' } },
    { field: 'defense', change: { defense: 'other' } },
    { field: 'chips', change: { chips: ['runs-code'] } },
    { field: 'visual', change: { visual: { reach: { now: ['Nothing.'], afterFix: [] } } } },
  ])('changes when $field changes', ({ change }) => {
    // given
    const before = findingFingerprint(finding());
    // when
    const got = findingFingerprint(finding(change));
    // then
    expect(got).not.toBe(before);
  });

  test.each<{ field: string; change: Partial<Finding> }>([
    { field: 'id', change: { id: 'F9' } },
    { field: 'line', change: { line: 7 } },
    { field: 'sources', change: { sources: ['agent-review'] } },
    { field: 'recommend', change: { recommend: { decision: 'fix-now', why: 'easy' } } },
    { field: 'applied', change: { applied: { at: '2026-11-16T12:00:00.000Z', commit: 'abc1234', cardKey: null } } },
    {
      field: 'decision',
      change: { decision: { kind: 'not-real', reason: null, decidedAt: '2026-11-16T12:00:00.000Z' } },
    },
    { field: 'severityOverride', change: { severityOverride: 'low' } },
    { field: 'identity', change: { identity: { kind: 'dependency', advisory: 'GHSA-1', package: 'lodash' } } },
    { field: 'attacker', change: { attacker: 'anyone who can open a PR' } },
    { field: 'likelihood', change: { likelihood: 'likely' } },
    { field: 'fixSize', change: { fixSize: 'large' } },
    {
      field: 'lesson',
      change: { lesson: { note: 'Quote branch names.', mode: 'now', at: '2026-11-16T12:00:00.000Z' } },
    },
  ])('ignores $field', ({ change }) => {
    // given
    const before = findingFingerprint(finding());
    // when
    const got = findingFingerprint(finding(change));
    // then
    expect(got).toBe(before);
  });

  test('treats a key set to undefined as missing', () => {
    // given
    const before = findingFingerprint(finding({ visual: { path: [{ actor: 'a', step: 's' }] } }));
    // when
    const got = findingFingerprint(finding({ visual: { path: [{ actor: 'a', step: 's', crosses: undefined }] } }));
    // then
    expect(got).toBe(before);
  });

  test('matches the hash the card skill computes', () => {
    // given
    const fixed = finding();
    // when
    const got = findingFingerprint(fixed);
    // then
    expect(got).toBe('fb13a7b295f1ffaefc13101f7f5ff04e16c8d0bc75f5d53b5382585bcbe817bf');
  });
});
