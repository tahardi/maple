import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { errorText } from '@shared/errors/errorText';
import { findingsSchema } from './findingsSchema';

const KEY = /^[A-Z][A-Z0-9]*-\d+$/;

function versionOf(data: unknown): unknown {
  return typeof data === 'object' && data !== null && 'version' in data ? data.version : null;
}

export async function readFindings(dir: string, key: string): Promise<FindingsFile | null> {
  if (!KEY.test(key)) {
    throw new Error(`reading findings: bad card key ${key}`);
  }
  const name = `${key}.json`;
  let text: string;
  try {
    text = await readFile(join(dir, name), 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw new Error(`reading findings: ${name}: ${errorText(err)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`reading findings: ${name}: ${errorText(err)}`);
  }
  const version = versionOf(data);
  if (typeof version === 'number' && version > 1) {
    throw new Error(`reading findings: ${name} is from a newer Maple`);
  }
  const parsed = findingsSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`reading findings: ${name}: ${issue.path.join('.')}: ${issue.message}`);
  }
  return parsed.data;
}
