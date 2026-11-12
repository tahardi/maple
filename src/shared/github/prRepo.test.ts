import { describe, expect, test } from 'vitest';
import { prRepo } from './prRepo';

describe('prRepo', () => {
  test.each([
    { url: 'https://github.com/tahardi/dotclaude/pull/8', expected: 'tahardi/dotclaude' },
    { url: 'https://github.com/my_org/site.github.io/pull/1', expected: 'my_org/site.github.io' },
  ])('reads the repo from $url', ({ url, expected }) => {
    // given
    const prUrl = url;
    // when
    const repo = prRepo(prUrl);
    // then
    expect(repo).toBe(expected);
  });
});
