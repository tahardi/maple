import { readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { configDir } from '@main/app/config/config';
import { isInside, MAX_BYTES } from '@main/util/paths';
import { isMissing } from '@main/util/isMissing';

export function snapshotDir(sessionId: string): string {
  return join(configDir(), 'snapshots', sessionId);
}

export async function readSnapshot(sessionId: string, path: string): Promise<string | null> {
  const root = snapshotDir(sessionId);
  const full = resolve(root, path);
  if (!isInside(root, full) || !full.endsWith('.md')) {
    throw new Error('reading snapshot: path is outside the snapshots');
  }
  try {
    if ((await stat(full)).size > MAX_BYTES) {
      throw new Error('reading snapshot: note is too large to compare (over 2 MB)');
    }
    return await readFile(full, 'utf8');
  } catch (err) {
    if (isMissing(err)) {
      return null;
    }
    throw err;
  }
}

export async function removeSnapshots(sessionId: string): Promise<void> {
  await rm(snapshotDir(sessionId), { recursive: true, force: true });
}
