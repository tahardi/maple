import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Blocker, Card, Sprint } from '@shared/types';
import { adfToMarkdown } from './adf';

export type JiraCreds = { site: string; email: string; token: string };

const FIELDS = 'summary,status,labels,issuelinks,customfield_10016,description';

const statusSchema = z.object({ name: z.enum(['To Do', 'In Progress', 'In Review', 'Done']) });

const issueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: statusSchema,
    labels: z.array(z.string()),
    customfield_10016: z.number().nullish(),
    description: z.unknown(),
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

const sprintIssuesSchema = z.object({ issues: z.array(issueSchema) });

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
      const issues = sprintIssuesSchema.parse(
        await this.get(`/rest/agile/1.0/sprint/${String(sprint.id)}/issue?maxResults=200&fields=${FIELDS}`),
      );
      return {
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        cards: issues.issues.map((issue) => this.toCard(issue)),
      };
    } catch (err) {
      throw new Error(`fetching sprint: ${errorMessage(err)}`, { cause: err });
    }
  }

  async getCard(key: string): Promise<Card> {
    try {
      return this.toCard(issueSchema.parse(await this.get(`/rest/api/3/issue/${key}?fields=${FIELDS}`)));
    } catch (err) {
      throw new Error(`fetching card: ${errorMessage(err)}`, { cause: err });
    }
  }

  private async get(path: string): Promise<unknown> {
    const auth = Buffer.from(`${this.creds.email}:${this.creds.token}`).toString('base64');
    const res = await this.fetchFn(`${this.creds.site}${path}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Jira returned ${String(res.status)}`);
    }
    return res.json();
  }

  private toCard(issue: z.infer<typeof issueSchema>): Card {
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
      descriptionMd: typeof fields.description === 'string' ? fields.description : adfToMarkdown(fields.description),
      url: `${this.creds.site}/browse/${issue.key}`,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
