import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_BYTES } from '@main/util/paths';

export async function hasTryTarget(dir: string): Promise<boolean> {
  const path = join(dir, 'Makefile');
  try {
    const info = await stat(path);
    return info.isFile() && info.size <= MAX_BYTES && /^try\s*::?(?![:=])/m.test(await readFile(path, 'utf8'));
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}
