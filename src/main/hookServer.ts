import { rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { HookEvent } from '@shared/types';
import { z } from 'zod';
import { configDir } from './config';
import { appLogger, type Logger } from './log';

const eventSchema = z.object({
  tabId: z.string(),
  event: z.enum(['Stop', 'Notification', 'UserPromptSubmit']),
  notificationType: z.string().nullable(),
});

export function hookSocketPath(): string {
  return join(process.env.XDG_RUNTIME_DIR ?? configDir(), 'maple.sock');
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
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
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
  return () =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
}
