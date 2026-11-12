import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Fetched } from '@shared/types/app/fetched';
import { syncPrompt } from '@shared/prompts/syncPrompt';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import { z } from 'zod';
import { KEEP_DAYS, MAX_MEGABYTES } from '@main/events/pruneEvents';
import { STATE_BACKUPS } from '@main/app/state/backupState';
import { appLogger, type Logger } from '@main/app/log/log';
import { errorText } from '@shared/errors/errorText';

const defaultActions = [
  { label: 'Address review', prompt: '/card {key}' },
  { label: 'Merge main', prompt: syncPrompt('{key}') },
];

export const DEFAULT_WAIT_MINUTES = 10;
export const DEFAULT_START_AT_ONCE = 4;
export const DEFAULT_MAX_WORKING = 8;
export const DEFAULT_MAX_LOAD_PER_CORE = 0.8;
export const DEFAULT_MIN_FREE_MEGABYTES = 2048;

const repoSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.][A-Za-z0-9_.-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*$/, 'must be owner/name')
  .refine((repo) => repo.split('/').every((part) => part !== '.' && part !== '..'), 'must be owner/name');

const configSchema = z
  .object({
    worktreesDir: z.string(),
    vaultDir: z.string().optional(),
    notifications: z.boolean().default(true),
    backgroundWaitMinutes: z.number().positive().default(DEFAULT_WAIT_MINUTES),
    eventKeepDays: z.number().int().positive().default(KEEP_DAYS),
    eventMaxMegabytes: z.number().positive().default(MAX_MEGABYTES),
    stateBackups: z.number().int().positive().default(STATE_BACKUPS),
    startAtOnce: z.number().int().positive().default(DEFAULT_START_AT_ONCE),
    maxWorking: z.number().int().positive().default(DEFAULT_MAX_WORKING),
    maxLoadPerCore: z.number().positive().default(DEFAULT_MAX_LOAD_PER_CORE),
    minFreeMegabytes: z.number().nonnegative().default(DEFAULT_MIN_FREE_MEGABYTES),
    projects: z.array(
      z.object({
        name: z.string(),
        jiraKey: z.string(),
        jiraBoardId: z.number(),
        plannerDir: z.string(),
        repo: repoSchema,
        otherRepos: z.array(repoSchema).default([]),
      }),
    ),
    actions: z.array(z.object({ label: z.string(), prompt: z.string() })).default(defaultActions),
  })
  .superRefine((config, ctx) => {
    if (config.projects.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'projects must not be empty' });
    }
    const seen = new Set<string>();
    for (const { jiraKey } of config.projects) {
      if (seen.has(jiraKey)) {
        ctx.addIssue({ code: 'custom', message: `duplicate jiraKey ${jiraKey}` });
      }
      seen.add(jiraKey);
    }
  });

export function configDir(): string {
  return process.env.MAPLE_CONFIG_DIR ?? join(homedir(), '.config', 'maple');
}

export function expandHome(p: string): string {
  if (p === '~') {
    return homedir();
  }
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
}

function failed(error: string): Fetched<MapleConfig> {
  return { data: null, error, fetchedAt: null };
}

export async function loadConfig(dir: string = configDir(), logger: Logger = appLogger): Promise<Fetched<MapleConfig>> {
  const result = await readConfig(dir);
  if (result.data) {
    logger.info('config', 'loaded', { projects: result.data.projects.length });
  } else {
    logger.error('config', 'failed', { error: result.error });
  }
  return result;
}

async function readConfig(dir: string): Promise<Fetched<MapleConfig>> {
  const path = join(dir, 'config.json');
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return failed(`reading config: ${path} does not exist`);
    }
    return failed(`reading config: ${errorText(err)}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return failed(`parsing config: ${errorText(err)}`);
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
    return failed(`reading config: ${where}${issue.message}`);
  }

  const config = parsed.data;
  return {
    data: {
      ...config,
      worktreesDir: expandHome(config.worktreesDir),
      vaultDir: config.vaultDir === undefined ? null : expandHome(config.vaultDir),
      projects: config.projects.map((project) => ({ ...project, plannerDir: expandHome(project.plannerDir) })),
    },
    error: null,
    fetchedAt: new Date().toISOString(),
  };
}
