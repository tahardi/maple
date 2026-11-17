import type { RenderProcessGoneDetails } from 'electron';
import { appLogger, type Logger } from '@main/app/log/log';

type Reloadable = {
  on(event: 'render-process-gone', listener: (event: unknown, details: RenderProcessGoneDetails) => void): unknown;
  reload(): void;
  isDestroyed(): boolean;
};

const RELOAD_GAP_MS = 10_000;

export function reloadOnCrash(contents: Reloadable, logger: Logger = appLogger, now: () => number = Date.now): void {
  let lastReload: number | null = null;
  contents.on('render-process-gone', (_event, { reason, exitCode }) => {
    if (reason === 'clean-exit' || contents.isDestroyed()) {
      logger.error('app', 'renderer gone', { reason, exitCode });
      return;
    }
    if (lastReload !== null && now() - lastReload < RELOAD_GAP_MS) {
      logger.error('app', 'renderer crashed again, not reloading', { reason, exitCode });
      return;
    }
    logger.error('app', 'renderer gone', { reason, exitCode });
    lastReload = now();
    contents.reload();
  });
}
