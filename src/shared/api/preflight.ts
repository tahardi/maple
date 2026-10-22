import type { ChannelKind } from '../ipc';
import type { PreflightProblem } from '../types/app';

export type PreflightApi = {
  run(): Promise<PreflightProblem[]>;
};

export const PREFLIGHT_CHANNELS = {
  run: 'invoke',
} as const satisfies { [M in keyof PreflightApi]: ChannelKind };
