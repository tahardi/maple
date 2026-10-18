import { homedir } from 'node:os';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import { defaultRunner, runPreflight } from '../preflight';

export function registerPreflight(): void {
  ipcMain.handle('preflight:run', () =>
    runPreflight(defaultRunner, process.env.MAPLE_JIRA_ENV ?? join(homedir(), '.config', 'jira', 'env')),
  );
}
