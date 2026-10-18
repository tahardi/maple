import { z } from 'zod';
import type { Fetched, Sprint } from '@shared/types';
import { JiraClient, jiraEnvPath, readCreds } from '../jira';
import { appLogger, type Logger } from '../log';
import { SprintCache } from '../sprintCache';
import type { IpcDeps } from './index';
import { handle, projectKeyArg } from './validated';

export function registerJira(deps: IpcDeps, logger: Logger = appLogger): void {
  const ready = readCreds(jiraEnvPath()).then(
    (creds) => {
      const client = new JiraClient(creds);
      return { cache: new SprintCache((p) => client.activeSprint(p.jiraBoardId)), error: null };
    },
    (err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('jira', 'failed', { operation: 'readCreds', error });
      return { cache: null, error };
    },
  );
  handle('jira:sprint', z.tuple([projectKeyArg]), async (projectKey): Promise<Fetched<Sprint>> => {
    const project = await deps.project(projectKey);
    if (!project) {
      return { data: null, fetchedAt: null, error: `fetching sprint: unknown project ${projectKey}` };
    }
    const { cache, error } = await ready;
    if (!cache) {
      return { data: null, fetchedAt: null, error };
    }
    const sprint = await cache.get(project);
    if (sprint.error !== null) {
      logger.warn('jira', 'failed', { operation: 'activeSprint', projectKey, error: sprint.error });
    }
    return sprint;
  });
}
