import { describe, expect, test } from 'vitest';
import { ghRunner } from '../../src/main/github/ghRunner';
import { batchKey, fetchPrs } from '../../src/main/github/prBatch';

const run = ghRunner('tahardi/maple');

async function prsFor(branch: string) {
  const pair = { repo: 'tahardi/maple', branch };
  const prs = (await fetchPrs(run, [pair])).get(batchKey(pair));
  if (!Array.isArray(prs)) {
    throw prs ?? new Error('listing PRs: no result');
  }
  return prs;
}

describe('github', () => {
  test('finds the merged PR for a known branch', async () => {
    // given
    const branch = 'mpl-7-typescript-standards';
    // when
    const pr = (await prsFor(branch)).at(0);
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

  test('returns no PRs for a branch with no PR', async () => {
    // given
    const branch = 'maple-live-test-no-such-branch';
    // when
    const prs = await prsFor(branch);
    // then
    expect(prs).toEqual([]);
  });
});
