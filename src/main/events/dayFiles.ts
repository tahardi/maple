import { readdir } from 'node:fs/promises';
import { isMissing } from '@main/util/isMissing';

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

export async function dayFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => DAY_FILE.test(name)).sort();
  } catch (err) {
    if (isMissing(err)) {
      return [];
    }
    throw err;
  }
}
