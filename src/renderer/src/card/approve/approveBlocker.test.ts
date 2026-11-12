import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
import type { Dot } from '@shared/types/tabs/dot';
import { approveBlocker } from './approveBlocker';

const pr: PrInfo = {
  number: 7,
  url: 'https://github.com/tahardi/dig-days/pull/7',
  title: '[DIG-44] Trail Map',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 3, failed: 0, pending: 0, total: 3, runs: [] },
};

const review: Review = {
  number: 7,
  headSha: 'a'.repeat(40),
  baseSha: 'b'.repeat(40),
  added: 0,
  removed: 0,
  files: [],
  findings: [],
};

type Overrides = { pr?: PrInfo | null; review?: Review | null; dot?: Dot; worktreeExists?: boolean };

function blocker(overrides: Overrides = {}): string | null {
  return approveBlocker({
    pr: overrides.pr === undefined ? pr : overrides.pr,
    review: overrides.review === undefined ? review : overrides.review,
    dot: overrides.dot ?? 'ready',
    worktreeExists: overrides.worktreeExists ?? true,
  });
}

describe('approveBlocker', () => {
  test.each([
    { name: 'there is no worktree', overrides: { worktreeExists: false }, reason: 'No worktree' },
    { name: 'the agent is working', overrides: { dot: 'working' as const }, reason: 'Agent is working' },
    { name: 'there is no PR', overrides: { pr: null }, reason: 'No open PR' },
    { name: 'the PR is merged', overrides: { pr: { ...pr, state: 'MERGED' as const } }, reason: 'No open PR' },
    {
      name: 'checks are failing',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } } },
      reason: 'Checks are failing',
    },
    { name: 'the review is not loaded', overrides: { review: null }, reason: 'Review not loaded' },
    {
      name: 'the PR has new commits',
      overrides: { pr: { ...pr, headSha: 'c'.repeat(40) } },
      reason: 'PR has new commits',
    },
  ])('Approve is disabled when $name', ({ overrides, reason }) => {
    // when
    const got = blocker(overrides);
    // then
    expect(got).toBe(reason);
  });

  test.each(['waiting', 'ready', 'idle'] as const)('Approve is enabled when the dot is %s', (dot) => {
    // when
    const got = blocker({ dot });
    // then
    expect(got).toBeNull();
  });

  test('Approve is enabled while checks are only pending', () => {
    // when
    const got = blocker({ pr: { ...pr, checks: { passed: 1, failed: 0, pending: 2, total: 3, runs: [] } } });
    // then
    expect(got).toBeNull();
  });

  test.each([
    { name: 'working beats no PR', overrides: { dot: 'working' as const, pr: null }, reason: 'Agent is working' },
    {
      name: 'no worktree beats working',
      overrides: { dot: 'working' as const, worktreeExists: false },
      reason: 'No worktree',
    },
    {
      name: 'failing checks beat a missing review',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } }, review: null },
      reason: 'Checks are failing',
    },
  ])('Approve shows one reason: $name', ({ overrides, reason }) => {
    // when
    const got = blocker(overrides);
    // then
    expect(got).toBe(reason);
  });
});
