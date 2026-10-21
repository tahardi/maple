import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TabState } from '@shared/types';
import { z } from 'zod';
import { configDir } from './config';

export type SavedState = {
  version: 1;
  tabs: TabState[];
  closedSessions: Record<string, string>;
  notifications: boolean | null;
  zoom: number;
  lastProject: string | null;
};

const stateSchema = z.object({
  version: z.literal(1),
  tabs: z.array(
    z.object({
      id: z.string(),
      projectKey: z.string(),
      kind: z.enum(['planner', 'card']),
      cardKey: z.string().nullable(),
      sessionId: z.string(),
      worktreePath: z.string().nullable(),
    }),
  ),
  closedSessions: z.record(z.string(), z.string()).default({}),
  notifications: z.boolean().nullable(),
  zoom: z.number().default(0),
  lastProject: z.string().nullable().default(null),
});

function emptyState(): SavedState {
  return { version: 1, tabs: [], closedSessions: {}, notifications: null, zoom: 0, lastProject: null };
}

export async function loadState(dir: string = configDir()): Promise<{ state: SavedState; warning: string | null }> {
  let text: string;
  try {
    text = await readFile(join(dir, 'state.json'), 'utf8');
  } catch {
    return { state: emptyState(), warning: null };
  }
  try {
    return { state: stateSchema.parse(JSON.parse(text)), warning: null };
  } catch {
    return { state: emptyState(), warning: 'reading state: state.json is unreadable, starting with no tabs' };
  }
}

export async function saveState(state: SavedState, dir: string = configDir()): Promise<void> {
  const path = join(dir, 'state.json');
  const tmp = `${path}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, path);
}
