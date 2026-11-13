import type { ChannelKind } from './mapleApi';
import type { Lesson } from '../types/learning/lesson';
import type { LessonSummary } from '../types/learning/lessonSummary';
import type { QuizResult } from '../types/learning/quizResult';

export type LearningApi = {
  list(): Promise<LessonSummary[]>;
  setComfortable(path: string, comfortable: boolean): Promise<void>;
  read(path: string): Promise<Lesson>;
  grade(path: string, answers: number[]): Promise<QuizResult>;
};

export const LEARNING_CHANNELS = {
  list: 'invoke',
  setComfortable: 'invoke',
  read: 'invoke',
  grade: 'invoke',
} as const satisfies { [M in keyof LearningApi]: ChannelKind };
