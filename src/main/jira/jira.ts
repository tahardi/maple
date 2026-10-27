import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { BacklogGroup, Blocker, Card, Filed, Sprint } from '@shared/types/jira';
import { appLogger, type Logger } from '@main/app/log';
import { adfToMarkdown } from './adf';

export type JiraCreds = { site: string; email: string; token: string };

export type NewIssue = {
  projectKey: string;
  summary: string;
  description: unknown;
  parentKey: string | null;
  labels: string[];
};

const FIELDS = 'summary,status,labels,issuelinks,customfield_10016,description,parent';

const statusSchema = z.object({ name: z.enum(['To Do', 'In Progress', 'In Review', 'Done']) });

const issueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: statusSchema,
    labels: z.array(z.string()),
    customfield_10016: z.number().nullish(),
    description: z.unknown(),
    parent: z.object({ key: z.string(), fields: z.object({ summary: z.string() }) }).optional(),
    issuelinks: z.array(
      z.object({
        type: z.object({ name: z.string() }),
        inwardIssue: z.object({ key: z.string(), fields: z.object({ status: statusSchema }) }).optional(),
      }),
    ),
  }),
});

const sprintsSchema = z.object({
  values: z.array(z.object({ id: z.number(), name: z.string(), startDate: z.string(), endDate: z.string() })),
});

const epicsSchema = z.object({
  values: z.array(z.object({ key: z.string(), issueColor: z.object({ key: z.string() }).optional() })),
  isLast: z.boolean(),
});

const createdSchema = z.object({ key: z.string() });

const searchSchema = z.object({ issues: z.array(issueSchema), nextPageToken: z.string().optional() });

export function jiraEnvPath(): string {
  return process.env.MAPLE_JIRA_ENV ?? join(homedir(), '.config/jira/env');
}

export async function readCreds(path: string): Promise<JiraCreds> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`reading jira creds: ${errorMessage(err)}`, { cause: err });
  }
  const env = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^\s*(?:export\s+)?(\w+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      env.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2'));
    }
  }
  const get = (key: string): string => {
    const value = env.get(key);
    if (!value) {
      throw new Error(`reading jira creds: ${key} is missing`);
    }
    return value;
  };
  const site = get('JIRA_SITE').replace(/\/+$/, '');
  return {
    site: /^https?:\/\//.test(site) ? site : `https://${site}`,
    email: get('JIRA_EMAIL'),
    token: get('JIRA_TOKEN'),
  };
}

export class JiraClient {
  constructor(
    private readonly creds: JiraCreds,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly logger: Logger = appLogger,
  ) {}

  async activeSprint(boardId: number): Promise<Sprint | null> {
    try {
      const sprints = sprintsSchema.parse(
        await this.get(`/rest/agile/1.0/board/${String(boardId)}/sprint?state=active`),
      );
      const sprint = sprints.values.at(0);
      if (!sprint) {
        return null;
      }
      const [issues, colors] = await Promise.all([
        this.search(`sprint=${String(sprint.id)} ORDER BY Rank`),
        this.colorsOrEmpty(boardId),
      ]);
      const cards = issues.map((issue) => this.toCard(issue, colors));
      return { id: sprint.id, name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate, cards };
    } catch (err) {
      throw new Error(`fetching sprint: ${errorMessage(err)}`, { cause: err });
    }
  }

  async backlog(projectKey: string, boardId: number): Promise<BacklogGroup[]> {
    try {
      const [issues, colors] = await Promise.all([
        this.search(
          `project = ${projectKey} AND (sprint is EMPTY OR sprint not in openSprints()) AND statusCategory != Done ` +
            'AND issuetype != Epic ORDER BY Rank',
        ),
        this.colorsOrEmpty(boardId),
      ]);
      const epics = new Map<string, BacklogGroup>();
      const noEpic: BacklogGroup = { epic: null, cards: [] };
      for (const issue of issues) {
        const card = this.toCard(issue, colors);
        let group = noEpic;
        if (card.epic) {
          group = epics.get(card.epic.key) ?? { epic: card.epic, cards: [] };
          epics.set(card.epic.key, group);
        }
        group.cards.push(card);
      }
      return [...epics.values(), ...(noEpic.cards.length > 0 ? [noEpic] : [])];
    } catch (err) {
      throw new Error(`fetching backlog: ${errorMessage(err)}`, { cause: err });
    }
  }

  async getCard(key: string): Promise<Card> {
    try {
      return this.toCard(issueSchema.parse(await this.get(`/rest/api/3/issue/${key}?fields=${FIELDS}`)), new Map());
    } catch (err) {
      throw new Error(`fetching card: ${errorMessage(err)}`, { cause: err });
    }
  }

  async moveToSprint(sprintId: number, keys: readonly string[]): Promise<void> {
    try {
      await this.post(`/rest/agile/1.0/sprint/${String(sprintId)}/issue`, { issues: keys });
    } catch (err) {
      throw new Error(`moving cards to sprint: ${errorMessage(err)}`, { cause: err });
    }
  }

  async createIssue(issue: NewIssue): Promise<Filed> {
    try {
      const fields = {
        project: { key: issue.projectKey },
        summary: issue.summary,
        issuetype: { name: 'Task' },
        description: issue.description,
        labels: issue.labels,
        ...(issue.parentKey === null ? {} : { parent: { key: issue.parentKey } }),
      };
      const { key } = createdSchema.parse(await this.post('/rest/api/3/issue', { fields }));
      return { key, url: `${this.creds.site}/browse/${key}` };
    } catch (err) {
      throw new Error(`creating issue: ${errorMessage(err)}`, { cause: err });
    }
  }

  private async search(jql: string): Promise<z.infer<typeof issueSchema>[]> {
    const issues: z.infer<typeof issueSchema>[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ jql, maxResults: '200', fields: FIELDS });
      if (pageToken) {
        query.set('nextPageToken', pageToken);
      }
      const page = searchSchema.parse(await this.get(`/rest/api/3/search/jql?${query.toString()}`));
      issues.push(...page.issues);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return issues;
  }

  private async epicColors(boardId: number): Promise<Map<string, string>> {
    const colors = new Map<string, string>();
    try {
      let startAt = 0;
      let page: z.infer<typeof epicsSchema>;
      do {
        const query = new URLSearchParams({ startAt: String(startAt), maxResults: '50' });
        page = epicsSchema.parse(await this.get(`/rest/agile/1.0/board/${String(boardId)}/epic?${query.toString()}`));
        startAt += page.values.length;
        for (const epic of page.values) {
          if (epic.issueColor) {
            colors.set(epic.key, epic.issueColor.key);
          }
        }
      } while (!page.isLast && page.values.length > 0);
    } catch (err) {
      throw new Error(`fetching epics: ${errorMessage(err)}`, { cause: err });
    }
    return colors;
  }

  private async colorsOrEmpty(boardId: number): Promise<Map<string, string>> {
    try {
      return await this.epicColors(boardId);
    } catch (err) {
      this.logger.warn('jira', 'failed', { operation: 'epicColors', boardId, error: errorMessage(err) });
      return new Map();
    }
  }

  private get(path: string): Promise<unknown> {
    return this.send(path, {});
  }

  private post(path: string, body: unknown): Promise<unknown> {
    return this.send(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async send(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<unknown> {
    const auth = Buffer.from(`${this.creds.email}:${this.creds.token}`).toString('base64');
    const res = await this.fetchFn(`${this.creds.site}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const details = jiraErrors(await res.text().catch(() => ''));
      throw new Error(`Jira returned ${String(res.status)}${details === '' ? '' : `: ${details}`}`);
    }
    return res.status === 204 ? null : res.json();
  }

  private toCard(issue: z.infer<typeof issueSchema>, colors: ReadonlyMap<string, string>): Card {
    const { fields } = issue;
    const blockedBy: Blocker[] = fields.issuelinks.flatMap((link) =>
      link.type.name === 'Blocks' && link.inwardIssue
        ? [{ key: link.inwardIssue.key, status: link.inwardIssue.fields.status.name }]
        : [],
    );
    return {
      key: issue.key,
      summary: fields.summary,
      status: fields.status.name,
      points: fields.customfield_10016 ?? null,
      labels: fields.labels,
      blockedBy,
      epic: fields.parent
        ? {
            key: fields.parent.key,
            summary: fields.parent.fields.summary,
            color: colors.get(fields.parent.key) ?? null,
          }
        : null,
      descriptionMd: adfToMarkdown(fields.description),
      url: `${this.creds.site}/browse/${issue.key}`,
    };
  }
}

const errorBodySchema = z.object({
  errorMessages: z.array(z.string()).default([]),
  errors: z.record(z.string(), z.string()).default({}),
});

function jiraErrors(body: string): string {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return '';
  }
  const parsed = errorBodySchema.safeParse(json);
  if (!parsed.success) {
    return '';
  }
  const fields = Object.entries(parsed.data.errors).map(([field, message]) => `${field}: ${message}`);
  return [...parsed.data.errorMessages, ...fields].join('; ');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
