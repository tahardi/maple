import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { BacklogGroup, Filed, Report, Sprint } from '@shared/types/jira';
import type { Fetched } from '@shared/types/app';
import type { ProjectConfig } from '@shared/types/config';
import { JiraClient, jiraEnvPath, readCreds, type JiraCreds } from '@main/jira/jira';
import { appLogger, logsDir, type Logger } from '@main/app/log';
import { logTail, reportDescription } from '@main/jira/report';
import { SprintCache } from '@main/jira/sprintCache';
import type { IpcDeps } from './index';
import { cardKeyArg, handle, projectKeyArg } from './validated';

type Caches = { sprint: SprintCache<Sprint>; backlog: SprintCache<BacklogGroup[]> };

const reportArg = z.object({
  kind: z.enum(['bug', 'feature']),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(10_000),
});

export function registerJira(deps: IpcDeps, logger: Logger = appLogger): void {
  const ready = readCreds(jiraEnvPath()).then(
    (creds) => {
      const client = new JiraClient(creds);
      const caches: Caches = {
        sprint: new SprintCache((p: ProjectConfig) => client.activeSprint(p.jiraBoardId)),
        backlog: new SprintCache((p: ProjectConfig) => client.backlog(p.jiraKey)),
      };
      return { caches, client, creds, error: null };
    },
    (err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('jira', 'failed', { operation: 'readCreds', error });
      return { caches: null, client: null, creds: null, error };
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
  handle('jira:report', z.tuple([reportArg]), async (report): Promise<Filed> => {
    const jira = await ready;
    try {
      if (jira.client === null) {
        throw new Error(jira.error);
      }
      const filed = await jira.client.createIssue(await reportIssue(report, jira.creds));
      logger.info('jira', 'filed', { key: filed.key, kind: report.kind });
      return filed;
    } catch (err) {
      throw new Error(`filing report: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  });
}

async function reportIssue(report: Report, creds: JiraCreds) {
  const bug = report.kind === 'bug';
  const log = bug ? await recentLog(creds) : null;
  return {
    projectKey: 'MPL',
    summary: report.title,
    description: reportDescription(report.description, log),
    parentKey: bug ? 'MPL-70' : null,
    labels: bug ? [] : ['needs-refinement'],
  };
}

async function recentLog(creds: JiraCreds): Promise<string> {
  const text = await readFile(join(logsDir(), 'main.log'), 'utf8').catch(() => '');
  return logTail(text, 200, [creds.token, creds.email], 20_000) || '(no log found)';
}
