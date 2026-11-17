import type { AttackStep } from '@shared/types/findings/findingVisual';
import type { LessonExample } from './lessonExample';
import type { LessonFinding } from './lessonFinding';
import type { LessonSummary } from './lessonSummary';
import type { QuizQuestion } from './quizQuestion';
import type { Trace } from './trace';

export type Lesson = {
  summary: LessonSummary;
  explanation: string | null;
  example: LessonExample | null;
  attack: string | null;
  path: AttackStep[] | null;
  trace: Trace | null;
  traceError: string | null;
  quiz: QuizQuestion[] | null;
  quizError: string | null;
  source: { title: string; url: string } | null;
  findings: LessonFinding[];
};
