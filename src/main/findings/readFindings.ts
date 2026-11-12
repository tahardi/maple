import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { errorText } from '@shared/errors/errorText';
import { findingsSchema } from './findingsSchema';

const KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const MAX_BYTES = 2 * 1024 * 1024;

type Read = { text: string } | { refused: string };

function versionOf(data: unknown): unknown {
  return typeof data === 'object' && data !== null && 'version' in data ? data.version : null;
}

async function readRegular(path: string): Promise<Read> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ELOOP') {
      return { refused: 'is not a regular file' };
    }
    throw err;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return { refused: 'is not a regular file' };
    }
    if (stats.size > MAX_BYTES) {
      return { refused: 'is over 2 MB' };
    }
    return { text: await handle.readFile('utf8') };
  } finally {
    await handle.close();
  }
}

export async function readFindings(dir: string, key: string): Promise<FindingsFile | null> {
  return (await readFindingsWithJson(dir, key))?.file ?? null;
}

export async function readFindingsWithJson(
  dir: string,
  key: string,
): Promise<{ file: FindingsFile; json: unknown } | null> {
  if (!KEY.test(key)) {
    throw new Error(`reading findings: bad card key ${key}`);
  }
  const name = `${key}.json`;
  const path = join(dir, name);
  let read: Read;
  try {
    read = await readRegular(path);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw new Error(`reading findings: ${name}: ${errorText(err)}`);
  }
  if ('refused' in read) {
    throw new Error(`reading findings: ${name} ${read.refused}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(read.text);
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
  return { file: parsed.data, json: data };
}
