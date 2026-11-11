import { describe, expect, test, vi } from 'vitest';
import type { Runner } from '@main/app/preflight';
import { openPrMergeState } from './mergeState';
import { PR_LIST_LIMIT } from './pr';

const row = (mergeable: string, isCrossRepository = false) => ({
  mergeable,
  headRefOid: 'a'.repeat(40),
  isCrossRepository,
});

const runner = (code: number, stdout: string, stderr = '') =>
  vi.fn<Runner>(() => Promise.resolve({ code, stdout, stderr }));

describe('openPrMergeState', () => {
  test.each([{ mergeable: 'MERGEABLE' }, { mergeable: 'CONFLICTING' }, { mergeable: 'UNKNOWN' }])(
    'returns $mergeable and the head sha of the open PR',
    async ({ mergeable }) => {
      // given
      const run = runner(0, JSON.stringify([row(mergeable)]));
      // when
      const state = await openPrMergeState(run, '/wts/a', 'mpl-1-x');
      // then
      expect(state).toEqual({ mergeable, headSha: 'a'.repeat(40) });
    },
  );

  test('returns null when the branch has no open PR', async () => {
    // given
    const run = runner(0, '[]');
    // when
    const state = await openPrMergeState(run, '/wts/a', 'mpl-1-x');
    // then
    expect(state).toBeNull();
  });

  test('skips a PR from a fork', async () => {
    // given
    const run = runner(0, JSON.stringify([row('MERGEABLE', true), row('CONFLICTING')]));
    // when
    const state = await openPrMergeState(run, '/wts/a', 'mpl-1-x');
    // then
    expect(state?.mergeable).toBe('CONFLICTING');
  });

  test('lists open PRs for the branch', async () => {
    // given
    const run = runner(0, '[]');
    // when
    await openPrMergeState(run, '/wts/a', 'mpl-1-x');
    // then
    expect(run).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--head',
        'mpl-1-x',
        '--state',
        'open',
        '--limit',
        PR_LIST_LIMIT,
        '--json',
        'mergeable,headRefOid,isCrossRepository',
      ],
      '/wts/a',
    );
  });

  test('throws listing open PRs with stderr when gh fails', async () => {
    // given
    const run = runner(1, '', 'boom');
    // when
    const result = openPrMergeState(run, '/wts/a', 'mpl-1-x');
    // then
    await expect(result).rejects.toThrow('listing open PRs: boom');
  });
});
