import { realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { isMissing } from './isMissing';

export const MAX_BYTES = 2_097_152;

export function isInside(root: string, full: string): boolean {
  const inside = relative(root, full);
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

export async function realOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if (isMissing(err)) {
      const parent = dirname(path);
      return parent === path ? path : join(await realOrSelf(parent), basename(path));
    }
    throw err;
  }
}
