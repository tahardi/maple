import type { LessonSummary } from '@shared/types/learning/lessonSummary';

export function lesson(slug: string, fields: Partial<LessonSummary> = {}): LessonSummary {
  return {
    path: `Learning/Security/${slug}.md`,
    slug,
    title: slug,
    status: 'to-learn',
    comfortable: false,
    lastGrade: null,
    findings: 0,
    hasLesson: false,
    error: null,
    ...fields,
  };
}
