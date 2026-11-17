import type { ChannelKind } from './mapleApi';
import type { PreflightProblem } from '../types/app/preflightProblem';

export type PreflightApi = {
  run(): Promise<PreflightProblem[]>;
};

export const PREFLIGHT_CHANNELS = {
  run: 'invoke',
} as const satisfies { [M in keyof PreflightApi]: ChannelKind };
