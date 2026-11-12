import { access, mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { QueuedCard } from '@shared/types/queue/queueState';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabState } from '@shared/types/tabs/tabState';
import { z } from 'zod';
import { backupState, STATE_BACKUPS } from './backupState';
import { configDir } from '@main/app/config/config';
import { dotSchema } from './dotSchema';
import { errorText } from '@shared/errors/errorText';
import { upgrade, type UpgradeStep } from '@main/util/upgrade';

export const STATE_VERSION = 2;

export const stateUpgrades: Readonly<Record<number, UpgradeStep>> = {
  1: (raw) => raw,
};

export type SavedState = {
  version: 2;
  tabs: TabState[];
  closedSessions: Record<string, string>;
  notifications: boolean | null;
  zoom: number;
  lastProject: string | null;
  seen: Record<string, Dot>;
  queue: QueuedCard[];
};

const stateSchema = z.object({
  version: z.literal(2),
  tabs: z.array(
    z.object({
      id: z.string(),
      projectKey: z.string(),
      kind: z.enum(['planner', 'card', 'vault', 'learning']),
      cardKey: z.string().nullable(),
      sessionId: z.string(),
      worktreePath: z.string().nullable(),
      worktreePaths: z.array(z.string()).default([]),
    }),
  ),
  closedSessions: z.record(z.string(), z.string()).default({}),
  notifications: z.boolean().nullable(),
  zoom: z.number().default(0),
  lastProject: z.string().nullable().default(null),
  seen: z.record(z.string(), dotSchema).catch({}),
  queue: z.array(z.object({ projectKey: z.string(), cardKey: z.string() })).default([]),
});

function emptyState(): SavedState {
  return {
    version: 2,
    tabs: [],
    closedSessions: {},
    notifications: null,
    zoom: 0,
    lastProject: null,
    seen: {},
    queue: [],
  };
}

async function keepCorrupt(path: string): Promise<string> {
  const kept = `${path}.corrupt`;
  try {
    await rename(path, kept);
    return `reading state: state.json is unreadable, kept it as ${kept}, starting with no tabs`;
  } catch (err) {
    const message = errorText(err);
    return `reading state: state.json is unreadable and could not be kept: ${message}, starting with no tabs`;
  }
}

export async function loadState(
  dir: string = configDir(),
  keep: number = STATE_BACKUPS,
): Promise<{ state: SavedState; warning: string | null; readOnly: boolean }> {
  const path = join(dir, 'state.json');
  let state: SavedState;
  try {
    const upgraded = upgrade(JSON.parse(await readFile(path, 'utf8')), STATE_VERSION, stateUpgrades);
    if (upgraded.newer) {
      const warning =
        `reading state: ${path} is from a newer Maple (version ${String(upgraded.version)}, ` +
        `this build reads up to ${String(STATE_VERSION)}), starting with no tabs and not saving until Maple is updated`;
      return { state: emptyState(), warning, readOnly: true };
    }
    const parsed = stateSchema.parse(upgraded.raw);
    const tabIds = new Set(parsed.tabs.map((t) => t.id));
    state = { ...parsed, seen: Object.fromEntries(Object.entries(parsed.seen).filter(([id]) => tabIds.has(id))) };
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return { state: emptyState(), warning: null, readOnly: false };
    }
    const warning = await keepCorrupt(path);
    const backup = `${path}.1`;
    const hasBackup = await access(backup).then(
      () => true,
      () => false,
    );
    return {
      state: emptyState(),
      warning: hasBackup ? `${warning} (newest backup: ${backup})` : warning,
      readOnly: false,
    };
  }
  try {
    await backupState(path, keep);
    return { state, warning: null, readOnly: false };
  } catch (err) {
    return { state, warning: `backing up state: ${errorText(err)}`, readOnly: false };
  }
}

export async function saveState(state: SavedState, dir: string = configDir()): Promise<void> {
  const path = join(dir, 'state.json');
  const tmp = `${path}.tmp`;
  await mkdir(dir, { recursive: true });
  const file = await open(tmp, 'w');
  try {
    await file.writeFile(JSON.stringify(state, null, 2));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(tmp, path);
}
