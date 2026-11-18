import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { expandHome } from '../../src/main/app/config/config';
import { createLogger } from '../../src/main/app/log/log';
import { LocalRunner } from '../../src/main/remote/localRunner';
import { SessionManager } from '../../src/main/sessions/SessionManager';
import { endTmux, writeTmuxConf } from '../../src/main/sessions/tmux';

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
  let sessions: SessionManager | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-live-'));
  });

  afterEach(async () => {
    for (const tab of sessions?.list() ?? []) {
      await sessions?.close(tab.id);
    }
    await rm(dir, { recursive: true, force: true });
  });

  test('runs an interactive planner session through the runner, then resumes it', async () => {
    // given
    const config: MapleConfig = {
      worktreesDir: dir,
      vaultDir: null,
      notifications: false,
      backgroundWaitMinutes: 15,
      eventKeepDays: 365,
      eventMaxMegabytes: 200,
      stateBackups: 3,
      startAtOnce: 4,
      startGapSeconds: 90,
      maxWorking: 8,
      maxLoadPerCore: 0.8,
      minFreeMegabytes: 2048,
      actions: [],
      remote: null,
      projects: [
        {
          name: 'Maple',
          jiraKey: 'MPL',
          jiraBoardId: 9,
          plannerDir: expandHome('~/Documents/code/maple'),
          repo: 'tahardi/maple',
          otherRepos: [],
        },
      ],
    };
    const runner = new LocalRunner();
    const manager = new SessionManager({
      config: () => config,
      save: () => Promise.resolve(),
      closedSessions: {},
      uuid: randomUUID,
      tmuxConf: await writeTmuxConf(runner, homedir()),
      endTmux: (name) => endTmux(runner, name),
      runner,
      home: homedir(),
      logger: silent,
    });
    sessions = manager;
    const resumed: boolean[] = [];
    manager.on('spawn', (_tabId, _prompted, wasResumed) => resumed.push(wasResumed));
    // when
    const tab = manager.openPlanner('MPL', null);
    await settled(manager, tab.id);
    manager.sendPrompt(tab.id, 'Reply with the single word ok.');
    await settled(manager, tab.id);
    // then
    expect(manager.isAlive(tab.id)).toBe(true);
    // when
    await manager.close(tab.id);
    const again = manager.openPlanner('MPL', tab.sessionId);
    await settled(manager, again.id);
    manager.sendPrompt(again.id, 'Reply with the single word again.');
    // then
    expect(again.sessionId).toBe(tab.sessionId);
    expect(resumed).toEqual([false, true]);
    expect(manager.isAlive(again.id)).toBe(true);
  });
});
