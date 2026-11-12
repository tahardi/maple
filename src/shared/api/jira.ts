import type { ChannelKind } from './mapleApi';
import type { BacklogGroup } from '../types/jira/backlogGroup';
import type { Filed } from '../types/jira/filed';
import type { Report } from '../types/jira/report';
import type { Sprint } from '../types/jira/sprint';
import type { Fetched } from '../types/app/fetched';

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
