import { z } from 'zod';
import type { BacklogGroup, Fetched, ProjectConfig, Sprint } from '@shared/types';
import { JiraClient, jiraEnvPath, readCreds } from '../jira';
import { appLogger, type Logger } from '../log';
import { SprintCache } from '../sprintCache';
import type { IpcDeps } from './index';
import { cardKeyArg, handle, projectKeyArg } from './validated';

type Caches = { sprint: SprintCache<Sprint>; backlog: SprintCache<BacklogGroup[]> };

export function registerJira(deps: IpcDeps, logger: Logger = appLogger): void {
  const ready = readCreds(jiraEnvPath()).then(
    (creds) => {
      const client = new JiraClient(creds);
      const caches: Caches = {
        sprint: new SprintCache((p: ProjectConfig) => client.activeSprint(p.jiraBoardId)),
        backlog: new SprintCache((p: ProjectConfig) => client.backlog(p.jiraKey)),
      };
      return { client, caches, error: null };
    },
    (err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('jira', 'failed', { operation: 'readCreds', error });
      return { client: null, caches: null, error };
    },
  );
  const serve = async <T>(
    projectKey: string,
    noun: string,
    operation: string,
    pick: (caches: Caches) => SprintCache<T>,
  ): Promise<Fetched<T>> => {
    const project = await deps.project(projectKey);
    if (!project) {
      return { data: null, fetchedAt: null, error: `fetching ${noun}: unknown project ${projectKey}` };
    }
    const { caches, error } = await ready;
    if (!caches) {
      return { data: null, fetchedAt: null, error };
    }
    const got = await pick(caches).get(project);
    if (got.error !== null) {
      logger.warn('jira', 'failed', { operation, projectKey, error: got.error });
    }
    return got;
  };
  handle('jira:sprint', z.tuple([projectKeyArg]), (projectKey) =>
    serve(projectKey, 'sprint', 'activeSprint', (c) => c.sprint),
  );
  handle('jira:backlog', z.tuple([projectKeyArg]), (projectKey) =>
    serve(projectKey, 'backlog', 'backlog', (c) => c.backlog),
  );
  handle(
    'jira:moveToSprint',
    z.tuple([z.number().int().positive(), z.array(cardKeyArg).min(1).max(50)]),
    async (sprintId, keys) => {
      const { client, error } = await ready;
      if (!client) {
        throw new Error(error);
      }
      try {
        await client.moveToSprint(sprintId, keys);
      } catch (err) {
        logger.warn('jira', 'failed', {
          operation: 'moveToSprint',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  );
}
