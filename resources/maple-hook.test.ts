import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const script = join(import.meta.dirname, 'maple-hook.mjs');

function runHook(env: Record<string, string>, stdin: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, 'Notification'], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout });
    });
    child.stdin.end(stdin);
  });
}

function listen(socketPath: string, received: string[]): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received.push(chunk.toString());
      });
    });
    server.listen(socketPath, () => {
      resolve(server);
    });
  });
}

describe('maple-hook', () => {
  let dir = '';
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-hook-'));
  });

  afterEach(async () => {
    server?.close();
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  test('sends one event line to the socket and exits 0', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const received: string[] = [];
    server = await listen(socketPath, received);
    // when
    const result = await runHook(
      { MAPLE_SOCKET: socketPath, MAPLE_TAB_ID: 'tab-1' },
      '{"notification_type":"permission_prompt"}',
    );
    // then
    expect(result).toEqual({ code: 0, stdout: '' });
    expect(received.join('')).toBe('{"tabId":"tab-1","event":"Notification","notificationType":"permission_prompt"}\n');
  });

  test('exits 0 within 1 second when the socket is missing', async () => {
    // given
    const start = Date.now();
    // when
    const result = await runHook({ MAPLE_SOCKET: join(dir, 'missing.sock'), MAPLE_TAB_ID: 'tab-1' }, '{}');
    // then
    expect(result).toEqual({ code: 0, stdout: '' });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
