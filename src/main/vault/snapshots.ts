import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { configDir } from '@main/app/config';
import { isInside } from '@main/app/paths';

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
    return await readFile(full, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function removeSnapshots(sessionId: string): Promise<void> {
  await rm(snapshotDir(sessionId), { recursive: true, force: true });
}
