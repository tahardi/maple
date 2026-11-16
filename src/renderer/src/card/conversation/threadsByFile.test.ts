import type { ReviewComment } from '@shared/types/github/reviewComment';
import { threadsByFile } from './threadsByFile';

const comment = (fields: Partial<ReviewComment> & Pick<ReviewComment, 'id'>): ReviewComment => ({
  replyTo: null,
  startLine: null,
  path: 'src/a.ts',
  line: 3,
  author: 'tahardi',
  body: `body ${String(fields.id)}`,
  threadId: null,
  resolved: false,
  ...fields,
});

describe('threadsByFile', () => {
  test('groups open threads by file in path order', () => {
    // given
    const onB = comment({ id: 1, path: 'src/b.ts', line: 2 });
    const line5 = comment({ id: 2, line: 5 });
    const line1 = comment({ id: 3, line: 1 });
    const reply = comment({ id: 4, line: 1, replyTo: 3 });
    // when
    const groups = threadsByFile([onB, line5, line1, reply]);
    // then
    expect(groups.resolved).toEqual([]);
    expect(groups.open.map((g) => g.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(groups.open[0]?.threads.map((t) => [t.line, t.comments.length])).toEqual([
      [1, 2],
      [5, 1],
    ]);
    expect(groups.open[1]?.threads.map((t) => [t.line, t.comments.length])).toEqual([[2, 1]]);
  });

  test('puts resolved threads in their own group', () => {
    // given
    const open = comment({ id: 1, line: 1 });
    const resolved = comment({ id: 2, line: 2, resolved: true });
    const onlyResolved = comment({ id: 3, path: 'src/b.ts', resolved: true });
    // when
    const groups = threadsByFile([open, resolved, onlyResolved]);
    // then
    expect(groups.open.map((g) => [g.path, g.threads.map((t) => t.id)])).toEqual([['src/a.ts', [1]]]);
    expect(groups.resolved.map((g) => [g.path, g.threads.map((t) => t.id)])).toEqual([
      ['src/a.ts', [2]],
      ['src/b.ts', [3]],
    ]);
  });

  test('returns empty groups without comments', () => {
    // given
    const comments: ReviewComment[] = [];
    // when
    const groups = threadsByFile(comments);
    // then
    expect(groups).toEqual({ open: [], resolved: [] });
  });
});
