import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { isLessonPath } from '@shared/learning/lessonPath';
import { errorText } from '@shared/errors/errorText';
import { listNotes, readNote } from '@main/vault/vault';
import { summarizeLesson } from './summarizeLesson';

async function summarize(vaultDir: string, path: string): Promise<LessonSummary> {
  try {
    return summarizeLesson(path, await readNote(vaultDir, path));
  } catch (err) {
    return { ...summarizeLesson(path, ''), error: errorText(err) };
  }
}

export async function listLessons(vaultDir: string): Promise<LessonSummary[]> {
  const paths = (await listNotes(vaultDir)).map((note) => note.path).filter(isLessonPath);
  return Promise.all(paths.map((path) => summarize(vaultDir, path)));
}
