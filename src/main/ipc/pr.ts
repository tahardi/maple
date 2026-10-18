import { ipcMain } from 'electron';
import type { Fetched, PrInfo } from '@shared/types';
import { prForBranch } from '../github';
import { defaultRunner } from '../preflight';
import type { IpcDeps } from './index';

async function lookup(worktree: string): Promise<PrInfo | null> {
  const { code, stdout, stderr } = await defaultRunner('git', ['branch', '--show-current'], worktree);
  if (code !== 0) {
    throw new Error(`reading branch: ${stderr}`);
  }
  return prForBranch(defaultRunner, worktree, stdout.trim());
}

export function registerPr(deps: IpcDeps): void {
  const lastGood = new Map<string, Fetched<PrInfo>>();
  ipcMain.handle('pr:get', async (_event, tabId: string): Promise<Fetched<PrInfo>> => {
    const worktree = deps.worktreeFor(tabId);
    if (!worktree) {
      return { data: null, error: null, fetchedAt: null };
    }
    try {
      const fetched = { data: await lookup(worktree), error: null, fetchedAt: new Date().toISOString() };
      lastGood.set(tabId, fetched);
      return fetched;
    } catch (err) {
      const cached = lastGood.get(tabId);
      const error = err instanceof Error ? err.message : String(err);
      return { data: cached?.data ?? null, error, fetchedAt: cached?.fetchedAt ?? null };
    }
  });
  ipcMain.handle('pr:approve', () => Promise.reject(new Error('pr:approve is not implemented')));
}
