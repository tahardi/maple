import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { errorText } from '@shared/errors/errorText';

export type JiraCreds = { site: string; email: string; token: string };

export function jiraEnvPath(): string {
  return process.env.MAPLE_JIRA_ENV ?? join(homedir(), '.config/jira/env');
}

export async function readCreds(path: string): Promise<JiraCreds> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`reading jira creds: ${errorText(err)}`, { cause: err });
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
