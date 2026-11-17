import type { Thread } from './commentThreads';
import { threadLabel } from './threadLabel';

const thread = (line: number, startLine: number | null): Thread => ({
  id: 1,
  line,
  startLine,
  threadId: null,
  resolved: false,
  comments: [],
});

describe('threadLabel', () => {
  test.each([
    { name: 'a single line', thread: thread(3, null), want: 'Line 3' },
    { name: 'a range', thread: thread(3, 1), want: 'Lines 1-3' },
  ])('labels $name', ({ thread, want }) => {
    // given
    const given = thread;
    // when
    const text = threadLabel(given);
    // then
    expect(text).toBe(want);
  });
});
