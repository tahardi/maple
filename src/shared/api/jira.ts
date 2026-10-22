import type { ChannelKind } from '../ipc';
import type { BacklogGroup, Filed, Report, Sprint } from '../types/jira';
import type { Fetched } from '../types/app';

export type JiraApi = {
  sprint(projectKey: string): Promise<Fetched<Sprint>>;
  backlog(projectKey: string): Promise<Fetched<BacklogGroup[]>>;
  moveToSprint(sprintId: number, keys: readonly string[]): Promise<void>;
  report(report: Report): Promise<Filed>;
};

export const JIRA_CHANNELS = {
  sprint: 'invoke',
  backlog: 'invoke',
  moveToSprint: 'invoke',
  report: 'invoke',
} as const satisfies { [M in keyof JiraApi]: ChannelKind };
