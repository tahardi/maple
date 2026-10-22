import type { ReviewComment } from '@shared/types';
import { toThreads } from './commentThreads';

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

const first = comment({ id: 1, startLine: 1 });
const reply = comment({ id: 2, replyTo: 1 });
const secondReply = comment({ id: 4, replyTo: 1 });

describe('toThreads', () => {
  test.each([
    {
      name: 'drops comments on other files',
      comments: [comment({ id: 1, path: 'src/b.ts' })],
      want: [],
    },
    {
      name: 'groups a first comment and its replies in list order',
      comments: [first, secondReply, reply],
      want: [{ id: 1, line: 3, startLine: 1, threadId: null, resolved: false, comments: [first, secondReply, reply] }],
    },
    {
      name: 'keeps two first comments on the same line as two threads',
      comments: [comment({ id: 5 }), comment({ id: 6 })],
      want: [
        { id: 5, line: 3, startLine: null, threadId: null, resolved: false, comments: [comment({ id: 5 })] },
        { id: 6, line: 3, startLine: null, threadId: null, resolved: false, comments: [comment({ id: 6 })] },
      ],
    },
    {
      name: 'sorts threads by line, then id',
      comments: [comment({ id: 9, line: 7 }), comment({ id: 8, line: 2 }), comment({ id: 3, line: 7 })],
      want: [
        { id: 8, line: 2, startLine: null, threadId: null, resolved: false, comments: [comment({ id: 8, line: 2 })] },
        { id: 3, line: 7, startLine: null, threadId: null, resolved: false, comments: [comment({ id: 3, line: 7 })] },
        { id: 9, line: 7, startLine: null, threadId: null, resolved: false, comments: [comment({ id: 9, line: 7 })] },
      ],
    },
    {
      name: 'starts a thread from a reply whose first comment is missing',
      comments: [reply, secondReply],
      want: [
        { id: 2, line: 3, startLine: null, threadId: null, resolved: false, comments: [reply] },
        { id: 4, line: 3, startLine: null, threadId: null, resolved: false, comments: [secondReply] },
      ],
    },
    {
      name: 'takes the line and order from the first comment when a reply is listed before it',
      comments: [{ ...reply, startLine: 2 }, first],
      want: [
        {
          id: 1,
          line: 3,
          startLine: 1,
          threadId: null,
          resolved: false,
          comments: [first, { ...reply, startLine: 2 }],
        },
      ],
    },
    {
      name: 'takes the thread id and resolved state from the first comment',
      comments: [{ ...first, threadId: 'PRRT_1', resolved: true }, reply],
      want: [
        {
          id: 1,
          line: 3,
          startLine: 1,
          threadId: 'PRRT_1',
          resolved: true,
          comments: [{ ...first, threadId: 'PRRT_1', resolved: true }, reply],
        },
      ],
    },
  ])('$name', ({ comments, want }) => {
    // given
    const path = 'src/a.ts';
    // when
    const threads = toThreads(comments, path);
    // then
    expect(threads).toEqual(want);
  });
});
