import { describe, expect, test } from 'vitest';
import { isLessonPath } from './lessonPath';

describe('lessonPath', () => {
  test.each([
    { path: 'Learning/Security/command-injection.md', want: true },
    { path: 'Learning/Security/xss.md', want: true },
    { path: `Learning/Security/${'a'.repeat(60)}.md`, want: true },
    { path: `Learning/Security/${'a'.repeat(61)}.md`, want: false },
    { path: '../x.md', want: false },
    { path: 'Learning/Security/../x.md', want: false },
    { path: 'Learning/Security/A.md', want: false },
    { path: 'Learning/Security/nested/x.md', want: false },
    { path: 'Other/Learning/Security/x.md', want: false },
    { path: 'Learning/Security/x.txt', want: false },
    { path: 'Learning/Security/.md', want: false },
  ])('$path is a lesson path: $want', ({ path, want }) => {
    // given
    const candidate = path;
    // when
    const got = isLessonPath(candidate);
    // then
    expect(got).toBe(want);
  });
});
