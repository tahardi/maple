import { readFile, rename, writeFile } from 'node:fs/promises';

export const STATE_BACKUPS = 3;

function isMissing(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}

export async function backupState(path: string, keep: number = STATE_BACKUPS): Promise<void> {
  const current = await readFile(path);
  let newest: Buffer | null = null;
  try {
    newest = await readFile(`${path}.1`);
  } catch (err) {
    if (!isMissing(err)) {
      throw err;
    }
  }
  if (newest?.equals(current)) {
    return;
  }
  for (let i = keep - 1; i >= 1; i--) {
    try {
      await rename(`${path}.${String(i)}`, `${path}.${String(i + 1)}`);
    } catch (err) {
      if (!isMissing(err)) {
        throw err;
      }
    }
  }
  await writeFile(`${path}.1`, current);
}
