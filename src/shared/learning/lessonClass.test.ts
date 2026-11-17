import { describe, expect, test } from 'vitest';
import type { FindingIdentity } from '@shared/types/findings/findingIdentity';
import { lessonClass } from './lessonClass';

describe('lessonClass', () => {
  test.each<{ identity: FindingIdentity; want: string }>([
    { identity: { kind: 'code', class: 'command-injection', file: 'a.ts', hash: 'h' }, want: 'command-injection' },
    { identity: { kind: 'dependency', advisory: 'GHSA-1', package: 'lodash' }, want: 'vulnerable-dependency' },
  ])('gives $want for a $identity.kind finding', ({ identity, want }) => {
    // given
    const finding = identity;
    // when
    const got = lessonClass(finding);
    // then
    expect(got).toBe(want);
  });
});
