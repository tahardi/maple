import { z } from 'zod';
import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { errorText } from '@shared/errors/errorText';
import { readFrontmatter } from './frontmatter';

const gradesSchema = z.array(z.object({ date: z.string(), score: z.number(), total: z.number() }));

const ENTRY = /^### \d{4}-\d{2}-\d{2} [A-Z][A-Z0-9]*-\d+ F\d+: .+$/;

function findingEntries(body: string): string[][] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Findings\s*$/.test(line));
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  const section = end === -1 ? rest : rest.slice(0, end);
  const entries: string[][] = [];
  let current: string[] | null = null;
  for (const line of section) {
    if (ENTRY.test(line)) {
      current = [];
      entries.push(current);
    } else if (/^#{3,} /.test(line)) {
      current = null;
    } else {
      current?.push(line);
    }
  }
  return entries;
}

function hasTieIn(entry: readonly string[]): boolean {
  return entry.some((line) => line.trim() !== '' && !line.startsWith('- '));
}

export function summarizeLesson(path: string, text: string): LessonSummary {
  const slug = (path.split('/').pop() ?? path).replace(/\.md$/, '');
  let data: Record<string, unknown> = {};
  let body = text;
  let error: string | null = null;
  try {
    ({ data, body } = readFrontmatter(text));
  } catch (err) {
    error = errorText(err);
  }
  const grades = gradesSchema.safeParse(data.grades);
  const lastGrade = grades.success ? (grades.data.at(-1) ?? null) : null;
  const entries = findingEntries(body);
  const hasLesson = /^## Lesson\s*$/m.test(body);
  const comfortable = data.comfortable === true;
  const needsLesson = entries.length > 0 && !hasLesson && !comfortable;
  return {
    path,
    slug,
    title: /^# (.+)$/m.exec(body)?.[1].trim() ?? slug,
    status: data.status === 'learned' ? 'learned' : 'to-learn',
    comfortable,
    lastGrade,
    findings: entries.length,
    hasLesson,
    pending: entries.filter((entry) => !hasTieIn(entry)).length + (needsLesson ? 1 : 0),
    error,
  };
}
