import type { ChannelKind } from './mapleApi';
import type { Lesson } from '../types/learning/lesson';
import type { FindingLesson } from '../types/findings/findingLesson';
import type { LessonSummary } from '../types/learning/lessonSummary';
import type { QuizAnswerResult, QuizResult } from '../types/learning/quizResult';
import type { ReviewQuestion } from '../types/learning/reviewQuestion';

export type LearningApi = {
  list(): Promise<LessonSummary[]>;
  setComfortable(path: string, comfortable: boolean): Promise<void>;
  read(path: string): Promise<Lesson>;
  grade(path: string, answers: number[]): Promise<QuizResult>;
  review(path: string): Promise<ReviewQuestion[]>;
  gradeReview(path: string, index: number, answer: number): Promise<QuizAnswerResult>;
  fromFinding(
    tabId: string,
    findingId: string,
    mode: FindingLesson['mode'],
  ): Promise<{ note: string; learningTabId: string | null }>;
  teach(projectKey: string, path: string): Promise<string>;
};

export const LEARNING_CHANNELS = {
  list: 'invoke',
  setComfortable: 'invoke',
  read: 'invoke',
  grade: 'invoke',
  review: 'invoke',
  gradeReview: 'invoke',
  fromFinding: 'invoke',
  teach: 'invoke',
} as const satisfies { [M in keyof LearningApi]: ChannelKind };
