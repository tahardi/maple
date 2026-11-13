import { resumeDue } from '@shared/findings/resumeDue';
import { resumePrompt } from '@shared/prompts/resumePrompt';
import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from '@main/app/log/log';
import { readFindingsWithJson } from '@main/findings/readFindings';
import { queueFindings } from '@main/findings/queueFindings';
import { saveFindings } from '@main/findings/saveFindings';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import type { SessionManager } from './SessionManager';
import type { StatusEngine } from './StatusEngine';

export type FindingsResumeDeps = {
  sessions: SessionManager;
  status: StatusEngine;
  findingsDir: string;
  logger?: Logger;
};

export class FindingsResume {
  private readonly log: Logger;

  constructor(private readonly deps: FindingsResumeDeps) {
    this.log = deps.logger ?? appLogger;
    deps.status.on('status', (s) => {
      queueMicrotask(() => {
        void this.check(s.tabId);
      });
    });
  }

  start(): () => void {
    try {
      return watchWorktrees(this.deps.findingsDir, () => {
        for (const tab of this.deps.sessions.list()) {
          void this.check(tab.id);
        }
      });
    } catch (err) {
      this.log.warn('session', 'findings resume failed', { operation: 'watchWorktrees', error: errorText(err) });
      return () => undefined;
    }
  }

  private ready(tabId: string): boolean {
    const s = this.deps.status.statuses().find((t) => t.tabId === tabId);
    return (
      s !== undefined && s.sessionAlive && s.dot !== 'working' && s.sync === null && !this.deps.status.asking(tabId)
    );
  }

  private async check(tabId: string): Promise<void> {
    const tab = this.deps.sessions.get(tabId);
    const cardKey = tab?.cardKey ?? null;
    if (tab?.kind !== 'card' || cardKey === null || !this.ready(tabId)) {
      return;
    }
    const { findingsDir } = this.deps;
    try {
      await queueFindings(cardKey, async () => {
        const read = await readFindingsWithJson(findingsDir, cardKey);
        if (read === null || read.file.card !== cardKey || !resumeDue(read.file) || !this.ready(tabId)) {
          return;
        }
        const resume = { round: read.file.round, sentAt: new Date().toISOString() };
        await saveFindings(findingsDir, { ...read.file, resume }, read.json);
        this.deps.sessions.sendPrompt(tabId, resumePrompt(cardKey));
      });
    } catch (err) {
      this.log.warn('session', 'findings resume failed', { cardKey, error: errorText(err) });
    }
  }
}
