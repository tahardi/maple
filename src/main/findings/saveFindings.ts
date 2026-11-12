import { constants } from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { errorText } from '@shared/errors/errorText';

const KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW;

export async function saveFindings(dir: string, file: FindingsFile): Promise<void> {
  if (!KEY.test(file.card)) {
    throw new Error(`saving findings: bad card key ${file.card}`);
  }
  const name = `${file.card}.json`;
  const path = join(dir, name);
  const tmp = `${path}.maple.tmp`;
  try {
    const handle = await open(tmp, FLAGS, 0o600);
    try {
      await handle.writeFile(JSON.stringify(file, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, path);
  } catch (err) {
    throw new Error(`saving findings: ${name}: ${errorText(err)}`);
  }
}
