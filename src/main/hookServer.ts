import { chmod, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { HookEvent } from '@shared/types';
import { z } from 'zod';
import { configDir } from './config';
import { appLogger, type Logger } from './log';

const MAX_LINE = 64 * 1024;

const eventSchema = z.object({
  tabId: z.string(),
  event: z.enum(['Stop', 'Notification', 'UserPromptSubmit']),
  notificationType: z.string().nullable(),
});

export function hookSocketPath(): string {
  return join(process.env.MAPLE_CONFIG_DIR ?? process.env.XDG_RUNTIME_DIR ?? configDir(), 'maple.sock');
}

function parseLine(line: string): HookEvent | null {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function startHookServer(
  socketPath: string,
  onEvent: (e: HookEvent) => void,
  logger: Logger = appLogger,
): Promise<() => Promise<void>> {
  await rm(socketPath, { force: true });
  const server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    let dropping = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      if (dropping && lines.length > 0) {
        lines.shift();
        dropping = false;
      }
      if (buffer.length > MAX_LINE) {
        logger.warn('hook', 'dropped', { bytes: buffer.length });
        buffer = '';
        dropping = true;
      }
      for (const line of lines) {
        if (line.length > MAX_LINE) {
          logger.warn('hook', 'dropped', { bytes: line.length });
          continue;
        }
        const event = parseLine(line);
        if (event) {
          logger.info('hook', 'received', { ...event });
          onEvent(event);
        } else if (line.trim() !== '') {
          logger.warn('hook', 'malformed', { line: line.slice(0, 200) });
        }
      }
    });
    socket.on('error', (err) => {
      logger.warn('hook', 'failed', { operation: 'socket', error: err.message });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  await chmod(socketPath, 0o600);
  return () =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
}
