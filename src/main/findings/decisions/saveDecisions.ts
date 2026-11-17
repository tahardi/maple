import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { errorText } from '@shared/errors/errorText';
import type { StoredDecision } from './storedDecision';

const KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

export async function saveDecisions(dir: string, key: string, decisions: readonly StoredDecision[]): Promise<void> {
  if (!KEY.test(key)) {
    throw new Error(`saving decisions: bad card key ${key}`);
  }
  const name = `${key}.json`;
  const path = join(dir, name);
  const tmp = `${path}.${randomUUID()}.maple.tmp`;
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const handle = await open(tmp, FLAGS, 0o600);
    try {
      await handle.writeFile(JSON.stringify(decisions, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw new Error(`saving decisions: ${name}: ${errorText(err)}`);
  }
}
