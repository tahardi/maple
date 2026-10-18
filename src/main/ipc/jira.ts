import { ipcMain } from 'electron';
import type { Fetched, Sprint } from '@shared/types';
import { JiraClient, jiraEnvPath, readCreds } from '../jira';
import { SprintCache } from '../sprintCache';
import type { IpcDeps } from './index';

export function registerJira(deps: IpcDeps): void {
  const ready = readCreds(jiraEnvPath()).then(
    (creds) => {
      const client = new JiraClient(creds);
      return { cache: new SprintCache((p) => client.activeSprint(p.jiraBoardId)), error: null };
    },
    (err: unknown) => ({ cache: null, error: err instanceof Error ? err.message : String(err) }),
  );
  ipcMain.handle('jira:sprint', async (_event, projectKey: string): Promise<Fetched<Sprint>> => {
    const project = await deps.project(projectKey);
    if (!project) {
      return { data: null, fetchedAt: null, error: `fetching sprint: unknown project ${projectKey}` };
    }
    const { cache, error } = await ready;
    return cache ? cache.get(project) : { data: null, fetchedAt: null, error };
  });
}
