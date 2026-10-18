import { describe, expect, test } from 'vitest';
import { expandHome } from '../../src/main/config';
import { prForBranch } from '../../src/main/github';
import { defaultRunner } from '../../src/main/preflight';

describe('github', () => {
  test('finds the merged PR for a known branch', async () => {
    // given
    const repo = expandHome('~/Documents/code/maple');
    // when
    const pr = await prForBranch(defaultRunner, repo, 'mpl-7-typescript-standards');
    // then
    expect(pr?.state).toBe('MERGED');
    expect(pr?.number).toBeGreaterThan(0);
    expect(pr?.url.startsWith('https://github.com/tahardi/maple/pull/')).toBe(true);
  });
});
