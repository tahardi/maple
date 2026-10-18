import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { HookEvent } from '@shared/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startHookServer } from '../../src/main/hookServer';
import { writeHooksFile } from '../../src/main/hooksFile';

function runClaude(args: string[], env: Record<string, string>): Promise<{ code: number | null; stdout: string }> {
  return new Promise((done, fail) => {
    const child = spawn('claude', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', fail);
    child.on('close', (code) => {
      done({ code, stdout });
    });
  });
}

describe('claude hooks', () => {
  let dir = '';
  let stop: () => Promise<void> = () => Promise.resolve();
  const events: HookEvent[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-live-'));
    stop = await startHookServer(join(dir, 'maple.sock'), (e) => events.push(e));
  });

  afterEach(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });

  test('reports Stop and UserPromptSubmit, then resumes', async () => {
    // given
    const socket = join(dir, 'maple.sock');
    const hooks = await writeHooksFile(dir, process.execPath, resolve('resources/maple-hook.mjs'));
    const sessionId = randomUUID();
    const flags = ['--dangerously-skip-permissions', '--settings', hooks];
    // when
    const first = await runClaude(['-p', 'Reply with the single word ok.', ...flags, '--session-id', sessionId], {
      MAPLE_TAB_ID: 'live-1',
      MAPLE_SOCKET: socket,
    });
    // then
    expect(first.code).toBe(0);
    expect(first.stdout.toLowerCase()).toContain('ok');
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ tabId: 'live-1', event: 'UserPromptSubmit' }));
      expect(events).toContainEqual(expect.objectContaining({ tabId: 'live-1', event: 'Stop' }));
    });
    // when
    const second = await runClaude(['-p', 'Reply with the single word again.', ...flags, '--resume', sessionId], {
      MAPLE_TAB_ID: 'live-2',
      MAPLE_SOCKET: socket,
    });
    // then
    expect(second.code).toBe(0);
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ tabId: 'live-2', event: 'Stop' }));
    });
  });
});
