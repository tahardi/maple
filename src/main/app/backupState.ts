import { copyFile, rename } from 'node:fs/promises';

const KEEP = 3;

export async function backupState(path: string): Promise<void> {
  for (let i = KEEP - 1; i >= 1; i--) {
    try {
      await rename(`${path}.${String(i)}`, `${path}.${String(i + 1)}`);
    } catch (err) {
      if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
        throw err;
      }
    }
  }
  await copyFile(path, `${path}.1`);
}
