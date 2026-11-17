import type { ReactNode } from 'react';

export type LessonStep = { name: string; pages: number; body: (page: number | null) => ReactNode };

export type LessonPlace = { step: number; page: number; label: string };

export function lessonPlaces(steps: readonly LessonStep[]): LessonPlace[] {
  return steps.flatMap(({ name, pages }, step) =>
    Array.from({ length: pages }, (_, page) => ({
      step,
      page,
      label: pages === 1 ? name : `${name} (${String(page + 1)} of ${String(pages)})`,
    })),
  );
}
