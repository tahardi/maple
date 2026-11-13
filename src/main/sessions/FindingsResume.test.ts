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
import type { HookEvent } from '@shared/types/tabs/hookEvent';
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

function storedSync(): FindingsFile {
  return JSON.parse(readFileSync(join(dir, `${KEY}.json`), 'utf8')) as FindingsFile;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

function setup(opened: TabState = tab, findingsDir = dir) {
  const sessions = Object.assign(new EventEmitter(), {
    get: vi.fn((id: string) => (id === opened.id ? opened : null)),
    list: vi.fn(() => [opened]),
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
    findingsDir,
    logger,
  });
  const stopResume = resume.start();
  stops.push(stopResume);
  const dotOf = () => status.statuses().find((s) => s.tabId === opened.id)?.dot;
  const spawn = (prompted: boolean) => {
    sessions.emit('spawn', opened.id, prompted, false);
  };
  const open = (prompted: boolean) => {
    spawn(prompted);
    const started: HookEvent = { tabId: opened.id, event: 'SessionStart', notificationType: null };
    status.hook(started);
    resume.hook(started);
  };
  const stop = async () => {
    status.hook({ tabId: opened.id, event: 'Stop', notificationType: null });
    await vi.waitFor(() => {
      expect(dotOf()).not.toBe('working');
    });
  };
  const turn = async () => {
    status.hook({ tabId: opened.id, event: 'UserPromptSubmit', notificationType: null });
    await stop();
  };
  const block = (blocker: string) => {
    if (blocker === 'permission prompt') {
      status.hook({ tabId: opened.id, event: 'Notification', notificationType: 'permission_prompt' });
    } else {
      status.setSync(opened.id, 'queued');
    }
  };
  const unblock = async (blocker: string) => {
    if (blocker === 'permission prompt') {
      await turn();
    } else {
      status.setSync(opened.id, null);
    }
  };
  const untilSent = () =>
    vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledWith(opened.id, resumePrompt(KEY));
    });
  return { sessions, logger, stopResume, spawn, open, stop, block, unblock, untilSent };
}

const blockers = [{ blocker: 'permission prompt' }, { blocker: 'queued sync' }];

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
    const { open, stop, untilSent } = setup();
    open(true);
    await stop();
    await settle();
    // when
    await save(allDecided);
    // then
    await untilSent();
  });

  test('does not send again when the file changes after the stamp', async () => {
    // given
    await save(oneLeft);
    const { sessions, open, stop, untilSent } = setup();
    open(true);
    await stop();
    await save(allDecided);
    await untilSent();
    // when
    await save(await stored());
    await settle();
    // then
    expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
  });

  test('does not send while the tab is working', async () => {
    // given
    await save(allDecided);
    const { sessions, open } = setup();
    // when
    open(true);
    await settle();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
  });

  test('waits while the tab is working, then sends when it stops', async () => {
    // given
    await save(allDecided);
    const { open, stop, untilSent } = setup();
    open(true);
    await settle();
    // when
    await stop();
    // then
    await untilSent();
  });

  test.each(blockers)(
    'does not send while a permission prompt is open or a sync is queued: $blocker',
    async ({ blocker }) => {
      // given
      await save(oneLeft);
      const { sessions, open, stop, block } = setup();
      open(true);
      await stop();
      block(blocker);
      // when
      await save(allDecided);
      await settle();
      // then
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
    },
  );

  test.each(blockers)('sends once the $blocker clears', async ({ blocker }) => {
    // given
    await save(oneLeft);
    const { open, stop, block, unblock, untilSent } = setup();
    open(true);
    await stop();
    block(blocker);
    await save(allDecided);
    await settle();
    // when
    await unblock(blocker);
    // then
    await untilSent();
  });

  test('stamps resume in the file before sending', async () => {
    // given
    await save(allDecided);
    const { sessions, logger, open } = setup();
    const seen: unknown[] = [];
    sessions.sendPrompt.mockImplementation(() => {
      seen.push(storedSync().resume);
    });
    // when
    open(false);
    // then
    await vi.waitFor(() => {
      expect(sessions.sendPrompt).toHaveBeenCalledTimes(1);
    });
    expect(seen).toEqual([{ round: 2, sentAt: expect.any(String) as string }]);
    expect((await stored()).findings.map((f) => f.what)).toEqual(['w', 'w']);
    expect(logger.info).toHaveBeenCalledWith('session', 'findings resume sent', {
      tabId: tab.id,
      cardKey: KEY,
      round: 2,
    });
  });

  test('does not send again after a restart when resume matches the round', async () => {
    // given
    await save(findings(allDecided.findings, { round: 2, sentAt: '2026-11-12T14:00:00.000Z' }));
    const { sessions, open } = setup();
    // when
    open(false);
    await settle();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
  });

  test('does not send to a reopened tab before Claude has started', async () => {
    // given
    await save(allDecided);
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
    const { sessions, open, stop, untilSent } = setup();
    open(true);
    await stop();
    sessions.emit('exit', tab.id, 0);
    await save(allDecided);
    await settle();
    // when
    open(false);
    // then
    await untilSent();
    expect((await stored()).resume?.round).toBe(2);
  });

  test('does not send to a tab that is not a card tab', async () => {
    // given
    await save(allDecided);
    const { sessions, open } = setup({ ...tab, kind: 'planner' });
    // when
    open(false);
    await settle();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
  });

  test('skips a findings file that names another card', async () => {
    // given
    await save({ ...allDecided, card: 'MPL-8' });
    const { sessions, open } = setup();
    // when
    open(false);
    await settle();
    // then
    expect(sessions.sendPrompt).not.toHaveBeenCalled();
    expect((await stored()).resume).toBeNull();
  });

  test('logs a findings dir it cannot watch and still stops cleanly', () => {
    // given
    const missing = join(dir, 'missing');
    // when
    const { logger, stopResume } = setup(tab, missing);
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'findings resume failed', {
      operation: 'watchWorktrees',
      error: expect.stringContaining('ENOENT') as string,
    });
    expect(stopResume).not.toThrow();
  });

  test('logs a bad findings file and sends nothing', async () => {
    // given
    await writeFile(join(dir, `${KEY}.json`), '{');
    const { sessions, logger, open } = setup();
    // when
    open(false);
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
