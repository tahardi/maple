import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';

export const MAX_BYTES = 2_097_152;

export function isInside(root: string, full: string): boolean {
  const inside = relative(root, full);
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

export async function realOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return path;
    }
    throw err;
  }
}
