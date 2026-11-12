import type { ChannelKind } from './mapleApi';
import type { LessonSummary } from '../types/learning/lessonSummary';

export type LearningApi = {
  list(): Promise<LessonSummary[]>;
  setComfortable(path: string, comfortable: boolean): Promise<void>;
};

export const LEARNING_CHANNELS = {
  list: 'invoke',
  setComfortable: 'invoke',
} as const satisfies { [M in keyof LearningApi]: ChannelKind };
