import type { ChannelKind } from './mapleApi';
import type { FindingLesson } from '../types/findings/findingLesson';
import type { LessonSummary } from '../types/learning/lessonSummary';

export type LearningApi = {
  list(): Promise<LessonSummary[]>;
  setComfortable(path: string, comfortable: boolean): Promise<void>;
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
  fromFinding: 'invoke',
  teach: 'invoke',
} as const satisfies { [M in keyof LearningApi]: ChannelKind };
