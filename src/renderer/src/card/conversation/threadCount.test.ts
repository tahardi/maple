import type { Thread } from '@renderer/card/comments/commentThreads';
import { threadCount } from './threadCount';

const thread = (id: number): Thread => ({
  id,
  line: id,
  startLine: null,
  threadId: null,
  resolved: false,
  comments: [],
});

describe('threadCount', () => {
  test.each([
    { name: 'no files', groups: [], want: 0 },
    {
      name: 'threads across files',
      groups: [
        { path: 'src/a.ts', threads: [thread(1), thread(2)] },
        { path: 'src/b.ts', threads: [thread(3)] },
      ],
      want: 3,
    },
  ])('counts $name', ({ groups, want }) => {
    // given
    const given = groups;
    // when
    const n = threadCount(given);
    // then
    expect(n).toBe(want);
  });
});
