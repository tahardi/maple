import type { ChannelKind } from '../ipc';
import type { Fetched, Sprint } from '../types';

export type JiraApi = {
  sprint(projectKey: string): Promise<Fetched<Sprint>>;
};

export const JIRA_CHANNELS = {
  sprint: 'invoke',
} as const satisfies { [M in keyof JiraApi]: ChannelKind };
