import type { TabState } from '@shared/types/tabs/tabState';
import type { Logger } from '@main/app/log/log';
import { errorText } from '@shared/errors/errorText';
import type { SessionDeps } from '../SessionManager';

type TabSaverDeps = {
  save: SessionDeps['save'];
  snapshot: () => { tabs: TabState[]; closedSessions: Record<string, string> };
  logger: Logger;
};

export class TabSaver {
  private holding = false;
  private unsaved = false;

  constructor(private readonly deps: TabSaverDeps) {}

  changed(): void {
    if (this.holding) {
      this.unsaved = true;
    } else {
      this.save();
    }
  }

  hold(): () => void {
    this.holding = true;
    this.unsaved = false;
    return () => {
      this.holding = false;
      if (this.unsaved) {
        this.save();
      }
    };
  }

  private save(): void {
    const { tabs, closedSessions } = this.deps.snapshot();
    this.deps.save(tabs, closedSessions).catch((err: unknown) => {
      this.deps.logger.error('session', 'failed', { operation: 'saveState', error: errorText(err) });
    });
  }
}
