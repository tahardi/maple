import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { HookEvent } from '@shared/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startHookServer } from '../../src/main/sessions/hookServer';
import { writeHooksFile } from '../../src/main/sessions/hooksFile';
import { createLogger } from '../../src/main/app/log';
import { hasTranscript } from '../../src/main/sessions/transcripts';

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
  let socket = '';
  let flags: string[] = [];
  let stop: () => Promise<void> = () => Promise.resolve();
  let events: HookEvent[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-live-'));
    socket = join(dir, 'maple.sock');
    events = [];
    stop = await startHookServer(
      socket,
      (e) => events.push(e),
      createLogger(() => undefined),
    );
    const hooks = await writeHooksFile(dir, process.execPath, resolve('resources/maple-hook.mjs'));
    flags = ['--dangerously-skip-permissions', '--settings', hooks];
  });

  afterEach(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });

  test('reports Stop and UserPromptSubmit, then resumes', async () => {
    // given
    const sessionId = randomUUID();
    expect(hasTranscript(sessionId)).toBe(false);
    // when
    const first = await runClaude(['-p', 'Reply with the single word ok.', ...flags, '--session-id', sessionId], {
      MAPLE_TAB_ID: 'live-1',
      MAPLE_SOCKET: socket,
    });
    // then
    expect(first.code).toBe(0);
    expect(first.stdout.toLowerCase()).toContain('ok');
    await vi.waitFor(() => {
      expect(events).toContainEqual({ tabId: 'live-1', event: 'UserPromptSubmit', notificationType: null });
      expect(events).toContainEqual({ tabId: 'live-1', event: 'Stop', notificationType: null });
    });
    expect(hasTranscript(sessionId)).toBe(true);
    // when
    const second = await runClaude(['-p', 'Reply with the single word again.', ...flags, '--resume', sessionId], {
      MAPLE_TAB_ID: 'live-2',
      MAPLE_SOCKET: socket,
    });
    // then
    expect(second.code).toBe(0);
    await vi.waitFor(() => {
      expect(events).toContainEqual({ tabId: 'live-2', event: 'UserPromptSubmit', notificationType: null });
      expect(events).toContainEqual({ tabId: 'live-2', event: 'Stop', notificationType: null });
    });
  });

  test('exits non-zero within five seconds when resuming an unknown session', async () => {
    // given
    const sessionId = randomUUID();
    const started = Date.now();
    // when
    const result = await runClaude(['-p', 'Reply with the single word ok.', ...flags, '--resume', sessionId], {
      MAPLE_TAB_ID: 'live-3',
      MAPLE_SOCKET: socket,
    });
    // then
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(events.filter((e) => e.tabId === 'live-3')).toEqual([]);
  });
});
