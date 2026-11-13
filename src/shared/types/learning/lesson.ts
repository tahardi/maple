import type { LessonFinding } from './lessonFinding';
import type { LessonSummary } from './lessonSummary';
import type { QuizQuestion } from './quizQuestion';
import type { Trace } from './trace';

export type Lesson = {
  summary: LessonSummary;
  explanation: string | null;
  attack: string | null;
  trace: Trace | null;
  traceError: string | null;
  quiz: QuizQuestion[] | null;
  quizError: string | null;
  findings: LessonFinding[];
};
