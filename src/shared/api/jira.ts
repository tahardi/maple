import type { ChannelKind } from '../ipc';
import type { BacklogGroup, Fetched, Sprint } from '../types';

export type JiraApi = {
  sprint(projectKey: string): Promise<Fetched<Sprint>>;
  backlog(projectKey: string): Promise<Fetched<BacklogGroup[]>>;
  moveToSprint(sprintId: number, keys: readonly string[]): Promise<void>;
};

export const JIRA_CHANNELS = {
  sprint: 'invoke',
  backlog: 'invoke',
  moveToSprint: 'invoke',
} as const satisfies { [M in keyof JiraApi]: ChannelKind };
