import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { errorText } from '@shared/errors/errorText';
import { findingsSchema } from './findingsSchema';

const KEY = /^[A-Z][A-Z0-9]*-\d+$/;

function versionOf(data: unknown): unknown {
  return typeof data === 'object' && data !== null && 'version' in data ? data.version : null;
}

async function readRegular(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ELOOP') {
      return null;
    }
    throw err;
  }
  try {
    return (await handle.stat()).isFile() ? await handle.readFile('utf8') : null;
  } finally {
    await handle.close();
  }
}

export async function readFindings(dir: string, key: string): Promise<FindingsFile | null> {
  if (!KEY.test(key)) {
    throw new Error(`reading findings: bad card key ${key}`);
  }
  const name = `${key}.json`;
  const path = join(dir, name);
  let text: string | null;
  try {
    text = await readRegular(path);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw new Error(`reading findings: ${name}: ${errorText(err)}`);
  }
  if (text === null) {
    throw new Error(`reading findings: ${name} is not a regular file`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`reading findings: ${name}: not valid JSON`);
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
