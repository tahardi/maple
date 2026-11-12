import { z } from 'zod';
import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { errorText } from '@shared/errors/errorText';
import { readFrontmatter } from './frontmatter';

const gradesSchema = z.array(z.object({ date: z.string(), score: z.number(), total: z.number() }));

const ENTRY = /^### \d{4}-\d{2}-\d{2} [A-Z][A-Z0-9]*-\d+ F\d+: .+$/;

function findingsCount(body: string): number {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Findings\s*$/.test(line));
  if (start === -1) {
    return 0;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => ENTRY.test(line)).length;
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
  return {
    path,
    slug,
    title: /^# (.+)$/m.exec(body)?.[1].trim() ?? slug,
    status: data.status === 'learned' ? 'learned' : 'to-learn',
    comfortable: data.comfortable === true,
    lastGrade,
    findings: findingsCount(body),
    hasLesson: /^## Lesson\s*$/m.test(body),
    error,
  };
}
