import { homedir } from 'node:os';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import { defaultRunner, runPreflight } from '@main/app/preflight';
import { projects } from './config';

export function registerPreflight(): void {
  ipcMain.handle('preflight:run', async () =>
    runPreflight(
      defaultRunner,
      process.env.MAPLE_JIRA_ENV ?? join(homedir(), '.config', 'jira', 'env'),
      process.env.MAPLE_CLAUDE_JSON ?? join(homedir(), '.claude.json'),
      process.env.MAPLE_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json'),
      (await projects()).map((p) => p.plannerDir),
    ),
  );
}
