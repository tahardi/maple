import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export type BuildInfo = { sha: string; date: string };

const buildInfoSchema = z.object({ sha: z.string(), date: z.string() });

export async function readBuildInfo(dir: string): Promise<BuildInfo> {
  try {
    return buildInfoSchema.parse(JSON.parse(await readFile(join(dir, 'build.json'), 'utf8')));
  } catch {
    return { sha: 'unknown', date: 'unknown' };
  }
}

export function aboutDetail(version: string, build: BuildInfo): string {
  return `Version ${version}\nCommit ${build.sha}\nBuilt ${build.date}`;
}
