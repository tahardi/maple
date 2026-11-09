import { join } from 'node:path';
import { appLogger, logsDir, type Logger } from './log';

type Deps = {
  showErrorBox: (title: string, content: string) => void;
  quit: () => void;
  logger?: Logger;
};

export function showStartupFailure(err: unknown, deps: Deps): void {
  const error = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  (deps.logger ?? appLogger).error('app', 'startup failed', { error, stack });
  deps.showErrorBox('Maple could not start', `${error}\n\nLog: ${join(logsDir(), 'main.log')}`);
  deps.quit();
}
