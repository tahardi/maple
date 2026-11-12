import { join } from 'node:path';
import log from 'electron-log/node';
import { configDir } from '@main/app/config/config';
import { errorText } from '@shared/errors/errorText';
import { isPlainObject } from './isPlainObject';
import { redact } from './redact';
import { scrubSecrets } from './scrubSecrets';

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
  | 'terminal'
  | 'vault'
  | 'findings'
  | 'events'
  | 'app';

type Level = 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

export type Logger = Record<Level, (scope: LogScope, msg: string, fields?: Fields) => void>;

const MAX_SIZE = 5 * 1024 * 1024;

let logSecrets: readonly string[] = [];

export function setLogSecrets(secrets: readonly string[]): void {
  logSecrets = secrets;
}

export function scrubLine(text: string): string {
  return scrubSecrets(text, logSecrets);
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
      write(level, scrubLine(`${scope} ${msg}${pairs.join('')}`));
    };
  return { info: at('info'), warn: at('warn'), error: at('error') };
}

export function logFailure<T>(logger: Logger, scope: LogScope, fields: Fields, run: () => T): T {
  const fail = (err: unknown): never => {
    logger.warn(scope, 'failed', { ...fields, error: errorText(err) });
    throw err;
  };
  try {
    const result = run();
    return result instanceof Promise ? (result.catch(fail) as T) : result;
  } catch (err) {
    return fail(err);
  }
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
