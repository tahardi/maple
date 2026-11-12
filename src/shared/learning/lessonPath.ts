export const LESSON_DIR = 'Learning/Security';

const LESSON_PATH = /^Learning\/Security\/[a-z0-9-]{1,60}\.md$/;

export function isLessonPath(path: string): boolean {
  return LESSON_PATH.test(path);
}
