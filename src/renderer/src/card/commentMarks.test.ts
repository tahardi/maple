import type { ReviewComment } from '@shared/types';
import { toCommentMarks } from './commentMarks';

const comment = (path: string, line: number, body: string): ReviewComment => ({
  path,
  line,
  author: 'tahardi',
  body,
});

describe('toCommentMarks', () => {
  test('groups the file comments by line with a preview and the full thread in the hover', () => {
    // given
    const comments = [
      comment('src/a.ts', 3, 'why?\nsecond line'),
      comment('src/b.ts', 1, 'other file'),
      comment('src/a.ts', 3, '**Claude:** because'),
      comment('src/a.ts', 9, 'nit'),
    ];
    // when
    const marks = toCommentMarks(comments, 'src/a.ts');
    // then
    expect(marks).toEqual([
      {
        line: 3,
        preview: '  💬 tahardi: why? (+1)',
        hover: '**tahardi**: why?\nsecond line\n\n---\n\n**tahardi**: **Claude:** because',
      },
      { line: 9, preview: '  💬 tahardi: nit', hover: '**tahardi**: nit' },
    ]);
  });

  test('cuts a long first line in the preview', () => {
    // given
    const comments = [comment('src/a.ts', 1, 'x'.repeat(100))];
    // when
    const [mark] = toCommentMarks(comments, 'src/a.ts');
    // then
    expect(mark.preview).toBe(`  💬 tahardi: ${'x'.repeat(60)}…`);
  });
});
