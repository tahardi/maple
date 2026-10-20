import { existsSync, readdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function projectsDir(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
}

export function hasTranscript(sessionId: string, root: string = projectsDir()): boolean {
  if (!existsSync(root)) {
    return false;
  }
  return readdirSync(root, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && existsSync(join(root, entry.name, `${sessionId}.jsonl`)),
  );
}

export async function transcriptFiles(sessionId: string, root: string): Promise<string[] | null> {
  if (!existsSync(root)) {
    return null;
  }
  const dirs = await readdir(root, { withFileTypes: true });
  const project = dirs.find((d) => d.isDirectory() && existsSync(join(root, d.name, `${sessionId}.jsonl`)));
  if (!project) {
    return null;
  }
  const main = join(root, project.name, `${sessionId}.jsonl`);
  const subagentsDir = join(root, project.name, sessionId, 'subagents');
  const subagents = existsSync(subagentsDir)
    ? (await readdir(subagentsDir)).filter((f) => f.endsWith('.jsonl')).map((f) => join(subagentsDir, f))
    : [];
  return [main, ...subagents];
}
