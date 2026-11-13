import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resumePrompt } from '@shared/prompts/resumePrompt';
import type { Card } from '@shared/types/jira/card';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingDecision } from '@shared/types/findings/findingDecision';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { TabState } from '@shared/types/tabs/tabState';
import { FindingsResume } from './FindingsResume';
import type { SessionManager } from './SessionManager';
import { StatusEngine } from './StatusEngine';

const KEY = 'MPL-9';
const decided: FindingDecision = { kind: 'fix-now', reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };

const tab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: KEY,
  sessionId: 's-t1',
  worktreePath: '/wts/mpl-9',
  worktreePaths: [],
};

const card: Card = {
  key: KEY,
  summary: 'Card',
  status: 'In Progress',
  points: 1,
  labels: [],
  blockedBy: [],
  epic: null,
  descriptionMd: '',
  url: `https://example.atlassian.net/browse/${KEY}`,
};

function finding(id: string, decision: FindingDecision | null): Finding {
  return {
    id,
    identity: { kind: 'code', class: 'xss', file: 'a.ts', hash: '0123456789abcdef' },
    line: 1,
    severity: 'high',
    sources: ['security-pass'],
    title: 't',
    what: 'w',
    how: 'h',
    impact: 'i',
    defense: 'd',
    chips: [],
    applied: null,
    decision,
    severityOverride: null,
  };
}

function findings(list: Finding[], resume: FindingsFile['resume'] = null): FindingsFile {
  return {
    version: 1,
    card: KEY,
    round: 2,
    headSha: 'a'.repeat(40),
    updatedAt: '2026-11-12T12:00:00.000Z',
    resume,
    findings: list,
  };
}

const allDecided = findings([finding('F1', decided), finding('F2', decided)]);
const oneLeft = findings([finding('F1', decided), finding('F2', null)]);

let dir: string;
let stops: (() => void)[];

async function save(file: FindingsFile): Promise<void> {
  await writeFile(join(dir, `${KEY}.json`), JSON.stringify(file));
}

async function stored(): Promise<FindingsFile> {
  return JSON.parse(await readFile(join(dir, `${KEY}.json`), 'utf8')) as FindingsFile;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

function setup() {
  const sessions = Object.assign(new EventEmitter(), {
    get: vi.fn((id: string) => (id === tab.id ? tab : null)),
    list: vi.fn(() => [tab]),
    sendPrompt: vi.fn(),
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const status = new StatusEngine({
    sessions: sessions as unknown as SessionManager,
    getCard: () => Promise.resolve(card),
    prFor: () => Promise.resolve({ data: null, error: null, fetchedAt: null }),
    waitLimitMs: () => 60_000,
    logger,
  });
  const resume = new FindingsResume({
    sessions: sessions as unknown as SessionManager,
    status,
    findingsDir: dir,
    logger,
  });
  stops.push(resume.start());
  const dotOf = () => status.statuses().find((s) => s.tabId === tab.id)?.dot;
  const spawn = (prompted: boolean) => {
    sessions.emit('spawn', tab.id, prompted, false);
  };
  const stop = async () => {
    status.hook({ tabId: tab.id, event: 'Stop', notificationType: null });
    await vi.waitFor(() => {
      expect(dotOf()).not.toBe('working');
    });
  };
  const turn = async () => {
    status.hook({ tabId: tab.id, event: 'UserPromptSubmit', notificationType: null });
    await stop();
  };
  return { sessions, status, logger, spawn, stop, turn };
}

describe('FindingsResume', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-findings-resume-'));
    stops = [];
  });

  afterEach(async () => {
    for (const stop of stops) {
      stop();
    }
    await rm(dir, { recursive: true, force: true });
  });

  test('sends the prompt once when the last finding is decided and the tab is ready', async () => {
    // given
    await save(oneLeft);
    const { sessions, spawn, stop } = setup();
    spawn(true);
    await stop();
    await settle();
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    // when
    await save(allDecided);
    // then
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledWith(tab.id, resumePrompt(KEY));
    });
    await save(await stored());
    await settle();
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
  });

  test('waits while the tab is working, then sends when it stops', async () => {
    // given
    await save(allDecided);
    const { sessions, spawn, stop } = setup();
    spawn(true);
    await settle();
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    // when
    await stop();
    // then
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledWith(tab.id, resumePrompt(KEY));
    });
  });

  test.each([{ blocker: 'permission prompt' }, { blocker: 'queued sync' }])(
    'does not send while a permission prompt is open or a sync is queued: $blocker',
    async ({ blocker }) => {
      // given
      await save(oneLeft);
      const { sessions, status, spawn, stop, turn } = setup();
      spawn(true);
      await stop();
      if (blocker === 'permission prompt') {
        status.hook({ tabId: tab.id, event: 'Notification', notificationType: 'permission_prompt' });
      } else {
        status.setSync(tab.id, 'queued');
      }
      // when
      await save(allDecided);
      await settle();
      // then
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
      if (blocker === 'permission prompt') {
        await turn();
      } else {
        status.setSync(tab.id, null);
      }
      await vi.waitFor(() => {
        expect(sessions.sendPrompt).toHaveBeenCalledWith(tab.id, resumePrompt(KEY));
      });
    },
  );

  test('stamps resume in the file before sending', async () => {
    // given
    await save(allDecided);
    const { sessions, spawn } = setup();
    const seen: unknown[] = [];
    sessions.sendPrompt.mockImplementation(() => {
      seen.push((JSON.parse(readFileSync(join(dir, `${KEY}.json`), 'utf8')) as FindingsFile).resume);
    });
    // when
    spawn(false);
    // then
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
    });
    expect(seen).toEqual([{ round: 2, sentAt: expect.any(String) as string }]);
    expect((await stored()).findings.map((f) => f.what)).toEqual(['w', 'w']);
  });

  test('does not send again after a restart when resume matches the round', async () => {
    // given
    await save(findings(allDecided.findings, { round: 2, sentAt: '2026-11-12T14:00:00.000Z' }));
    const { sessions, spawn } = setup();
    // when
    spawn(false);
    await settle();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
  });

  test('sends to a reopened tab once it spawns', async () => {
    // given
    await save(oneLeft);
    const { sessions, spawn, stop } = setup();
    spawn(true);
    await stop();
    sessions.emit('exit', tab.id, 0);
    await save(allDecided);
    await settle();
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    // when
    spawn(false);
    // then
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledWith(tab.id, resumePrompt(KEY));
    });
    expect((await stored()).resume?.round).toBe(2);
  });

  test('logs a bad findings file and sends nothing', async () => {
    // given
    await writeFile(join(dir, `${KEY}.json`), '{');
    const { sessions, logger, spawn } = setup();
    // when
    spawn(false);
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('session', 'findings resume failed', {
        cardKey: KEY,
        error: expect.stringContaining('not valid JSON') as string,
      });
    });
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
  });
});
