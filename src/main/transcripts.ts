import { existsSync, readdirSync } from 'node:fs';
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
