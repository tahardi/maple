import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';
import { PR_DESCRIPTION } from '@renderer/card/viewer/tabs/prDescription';
import { FINDINGS } from '@renderer/card/viewer/tabs/findingsTab';
import { COMMENTS_TAB } from '@renderer/card/viewer/tabs/commentsTab';
import { baseName } from './baseName';

describe('baseName', () => {
  test.each([
    { path: PR_DESCRIPTION, want: 'PR description' },
    { path: CARD_DESCRIPTION, want: 'Card description' },
    { path: FINDINGS, want: 'Findings' },
    { path: COMMENTS_TAB, want: 'Comments' },
    { path: 'vault:notes/Spike.md', want: 'Spike.md' },
    { path: 'src/a.ts', want: 'a.ts' },
    { path: 'Makefile', want: 'Makefile' },
  ])('names $path "$want"', ({ path, want }) => {
    // given
    // when
    const got = baseName(path);
    // then
    expect(got).toBe(want);
  });
});
