import { describe, expect, test } from 'vitest';
import { expandHome } from '../../src/main/app/config';
import { prForBranch } from '../../src/main/github/github';
import { defaultRunner } from '../../src/main/app/preflight';

const repo = expandHome('~/Documents/code/maple');

describe('github', () => {
  test('finds the merged PR for a known branch', async () => {
    // given
    const branch = 'mpl-7-typescript-standards';
    // when
    const pr = await prForBranch(defaultRunner, repo, branch);
    // then
    expect(pr?.state).toBe('MERGED');
    expect(pr?.number).toBeGreaterThan(0);
    expect(pr?.url.startsWith('https://github.com/tahardi/maple/pull/')).toBe(true);
    expect(pr?.title).toBe('[MPL-7] TypeScript Standards');
    expect(pr?.deviations).toContain('eslint-comments');
    expect(pr?.needsTaylor).toContain('CLAUDE.md');
    expect(pr?.checks.total).toBeGreaterThan(0);
    expect(pr?.checks.passed).toBe(pr?.checks.total);
    expect(pr?.checks.failed).toBe(0);
    expect(pr?.checks.pending).toBe(0);
    expect(pr?.checks.runs.every((r) => r.bucket === 'pass' || r.bucket === 'skipping')).toBe(true);
  });

  test('returns null for a branch with no PR', async () => {
    // given
    const branch = 'maple-live-test-no-such-branch';
    // when
    const pr = await prForBranch(defaultRunner, repo, branch);
    // then
    expect(pr).toBeNull();
  });
});
