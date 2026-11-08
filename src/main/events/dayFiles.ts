import { readdir } from 'node:fs/promises';

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

export async function dayFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => DAY_FILE.test(name)).sort();
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
