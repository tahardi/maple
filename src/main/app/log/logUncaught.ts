import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from './log';

export function logUncaught(logger: Logger = appLogger, proc: NodeJS.EventEmitter = process): void {
  proc.on('uncaughtException', (err: Error) => {
    logger.error('app', 'uncaught exception', { error: err.message, stack: err.stack });
  });
  proc.on('unhandledRejection', (reason: unknown) => {
    logger.error('app', 'unhandled rejection', {
      error: errorText(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
