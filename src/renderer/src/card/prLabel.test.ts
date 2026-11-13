import type { PrInfo } from '@shared/types/github/prInfo';
import { prLabel } from './prLabel';

const pr: PrInfo = {
  number: 123,
  url: 'https://github.com/tahardi/maple/pull/123',
  title: '[MPL-403] Always Show the Repo Name on the PR Label',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] },
};

describe('prLabel', () => {
  test.each([
    { name: 'the project repo', url: pr.url, want: 'maple PR #123' },
    { name: 'another repo', url: 'https://github.com/tahardi/dotclaude/pull/123', want: 'dotclaude PR #123' },
  ])('names a PR in $name with its repo', ({ url, want }) => {
    // given
    const info = { ...pr, url };
    // when
    const label = prLabel(info);
    // then
    expect(label).toBe(want);
  });
});
