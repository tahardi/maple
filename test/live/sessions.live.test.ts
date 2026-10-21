import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node-pty';
import type { HookEvent, MapleConfig } from '@shared/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { expandHome } from '../../src/main/config';
import { startHookServer } from '../../src/main/hookServer';
import { writeHooksFile } from '../../src/main/hooksFile';
import { createLogger } from '../../src/main/log';
import { SessionManager } from '../../src/main/sessions';
import { endTmux, writeTmuxConf } from '../../src/main/tmux';
import { hasTranscript } from '../../src/main/transcripts';

const silent = createLogger(() => undefined);

function settled(sessions: SessionManager, tabId: string, quietMs = 2000): Promise<void> {
  return new Promise((done) => {
    let timer = setTimeout(done, quietMs);
    const onData = (id: string) => {
      if (id === tabId) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          sessions.off('data', onData);
          done();
        }, quietMs);
      }
    };
    sessions.on('data', onData);
  });
}

describe('SessionManager with a real claude', () => {
  let dir = '';
  let events: HookEvent[] = [];
  let stop: () => Promise<void> = () => Promise.resolve();
  let sessions: SessionManager | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-live-'));
    events = [];
    stop = await startHookServer(join(dir, 'maple.sock'), (e) => events.push(e), silent);
  });

  afterEach(async () => {
    sessions?.killAll();
    await stop();
    await rm(dir, { recursive: true, force: true });
  });

  test('reports hooks from an interactive planner session, then resumes it', async () => {
    // given
    const config: MapleConfig = {
      worktreesDir: dir,
      vaultDir: null,
      notifications: false,
      reviewPoints: 20,
      actions: [],
      projects: [{ name: 'Maple', jiraKey: 'MPL', jiraBoardId: 9, plannerDir: expandHome('~/Documents/code/maple') }],
    };
    const manager = new SessionManager({
      spawn,
      config: () => config,
      hooksFile: await writeHooksFile(dir, process.execPath, resolve('resources/maple-hook.mjs')),
      socketPath: join(dir, 'maple.sock'),
      save: () => Promise.resolve(),
      closedSessions: {},
      uuid: randomUUID,
      hasTranscript,
      tmuxConf: await writeTmuxConf(dir),
      endTmux,
      logger: silent,
    });
    sessions = manager;
    const resumed: boolean[] = [];
    manager.on('spawn', (_tabId, _prompted, wasResumed) => resumed.push(wasResumed));
    // when
    const tab = manager.openPlanner('MPL', null);
    await settled(manager, tab.id);
    manager.sendPrompt(tab.id, 'Reply with the single word ok.');
    // then
    await vi.waitFor(
      () => {
        expect(events).toContainEqual({ tabId: tab.id, event: 'UserPromptSubmit', notificationType: null });
        expect(events).toContainEqual({ tabId: tab.id, event: 'Stop', notificationType: null });
      },
      { timeout: 90_000, interval: 500 },
    );
    expect(manager.isAlive(tab.id)).toBe(true);
    await vi.waitFor(
      () => {
        expect(hasTranscript(tab.sessionId)).toBe(true);
      },
      { timeout: 10_000, interval: 250 },
    );
    // when
    manager.close(tab.id);
    events = [];
    const again = manager.openPlanner('MPL', tab.sessionId);
    await settled(manager, again.id);
    manager.sendPrompt(again.id, 'Reply with the single word again.');
    // then
    expect(again.sessionId).toBe(tab.sessionId);
    expect(resumed).toEqual([false, true]);
    await vi.waitFor(
      () => {
        expect(events).toContainEqual({ tabId: again.id, event: 'Stop', notificationType: null });
      },
      { timeout: 90_000, interval: 500 },
    );
  });
});
