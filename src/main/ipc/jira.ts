import { homedir } from 'node:os';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import type { Fetched, Sprint } from '@shared/types';
import { JiraClient, readCreds } from '../jira';
import { SprintCache } from '../sprintCache';
import type { IpcDeps } from './index';

export function registerJira(deps: IpcDeps): void {
  const path = process.env.MAPLE_JIRA_ENV ?? join(homedir(), '.config/jira/env');
  const ready = readCreds(path).then(
    (creds) => {
      const client = new JiraClient(creds);
      return { cache: new SprintCache((p) => client.activeSprint(p.jiraBoardId)), error: null };
    },
    (err: unknown) => ({ cache: null, error: err instanceof Error ? err.message : String(err) }),
  );
  ipcMain.handle('jira:sprint', async (_event, projectKey: string): Promise<Fetched<Sprint>> => {
    const project = deps.project(projectKey);
    if (!project) {
      return { data: null, fetchedAt: null, error: `fetching sprint: unknown project ${projectKey}` };
    }
    const { cache, error } = await ready;
    return cache ? cache.get(project) : { data: null, fetchedAt: null, error };
  });
}
