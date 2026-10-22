import { join } from 'node:path';
import log from 'electron-log/node';
import { configDir } from './config';

export type LogScope =
  | 'session'
  | 'hook'
  | 'dot'
  | 'jira'
  | 'gh'
  | 'worktree'
  | 'restore'
  | 'config'
  | 'preflight'
  | 'repo'
  | 'vault'
  | 'app';

type Level = 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

export type Logger = Record<Level, (scope: LogScope, msg: string, fields?: Fields) => void>;

const SECRET = /token|authorization|password|secret|env/i;
const MAX_SIZE = 5 * 1024 * 1024;

export function redact(fields: Fields): Fields {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => !SECRET.test(key))
      .map(([key, value]) => [key, isPlainObject(value) ? redact(value) : value]),
  );
}

function isPlainObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function format(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map(String).join(',')
    : isPlainObject(value)
      ? JSON.stringify(value)
      : String(value);
  return /\s/.test(text) ? JSON.stringify(text) : text;
}

export function createLogger(write: (level: Level, line: string) => void): Logger {
  const at =
    (level: Level) =>
    (scope: LogScope, msg: string, fields: Fields = {}) => {
      const pairs = Object.entries(redact(fields)).map(([key, value]) => ` ${key}=${format(value)}`);
      write(level, `${scope} ${msg}${pairs.join('')}`);
    };
  return { info: at('info'), warn: at('warn'), error: at('error') };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function logFailure<T>(logger: Logger, scope: LogScope, fields: Fields, run: () => T): T {
  const fail = (err: unknown): never => {
    logger.warn(scope, 'failed', { ...fields, error: message(err) });
    throw err;
  };
  try {
    const result = run();
    return result instanceof Promise ? (result.catch(fail) as T) : result;
  } catch (err) {
    return fail(err);
  }
}

export function logUncaught(logger: Logger = appLogger, proc: NodeJS.EventEmitter = process): void {
  proc.on('uncaughtException', (err: Error) => {
    logger.error('app', 'uncaught exception', { error: err.message, stack: err.stack });
  });
  proc.on('unhandledRejection', (reason: unknown) => {
    logger.error('app', 'unhandled rejection', {
      error: message(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

export function logsDir(): string {
  return join(configDir(), 'logs');
}

log.transports.file.level = false;
log.transports.console.level = false;

export function startLogging(console: boolean): void {
  const { file } = log.transports;
  file.resolvePathFn = () => join(logsDir(), 'main.log');
  file.maxSize = MAX_SIZE;
  file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  file.level = 'info';
  log.transports.console.level = console ? 'info' : false;
}

export const appLogger = createLogger((level, line) => {
  log[level](line);
});
