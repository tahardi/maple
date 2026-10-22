import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Fetched, MapleConfig } from '@shared/types';
import { z } from 'zod';
import { appLogger, type Logger } from './log';

const defaultActions = [
  { label: 'Address review', prompt: '/card {key}' },
  { label: 'Merge main', prompt: 'Run the "Sync with Main" steps from the /card skill for {key}.' },
];

const configSchema = z
  .object({
    worktreesDir: z.string(),
    vaultDir: z.string().optional(),
    notifications: z.boolean().default(true),
    projects: z.array(
      z.object({ name: z.string(), jiraKey: z.string(), jiraBoardId: z.number(), plannerDir: z.string() }),
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
    return failed(`reading config: ${err instanceof Error ? err.message : String(err)}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return failed(`parsing config: ${err instanceof Error ? err.message : String(err)}`);
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
