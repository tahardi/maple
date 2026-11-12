import type { QuizGrade } from './quizGrade';

export type LessonSummary = {
  path: string;
  slug: string;
  title: string;
  status: 'to-learn' | 'learned';
  comfortable: boolean;
  lastGrade: QuizGrade | null;
  findings: number;
  hasLesson: boolean;
  error: string | null;
};
