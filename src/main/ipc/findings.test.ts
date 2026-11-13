import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StartQueue } from '@main/sessions/StartQueue';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import type { EventRefs } from '@shared/types/events/eventRecord';
import type { UiActionData } from '@shared/types/events/eventSchemas';
import type { Finding } from '@shared/types/findings/finding';
import { uiActionRecorder } from '@main/events/uiActions';
import { recordActions } from './recordActions';
import { registerFindings } from './findings';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle, watch } = vi.hoisted(() => {
  const state = { changed: (): void => undefined, dir: '' };
  return {
    handle: vi.fn<(channel: string, handler: Handler) => void>(),
    watch: {
      state,
      watchWorktrees: vi.fn((dir: string, cb: () => void) => {
        state.dir = dir;
        state.changed = cb;
        return vi.fn();
      }),
    },
  };
});

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/git/worktreeWatcher', () => ({ watchWorktrees: watch.watchWorktrees }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const sendToWindow = vi.fn();
const win = { isDestroyed: () => false, webContents: { send: sendToWindow } } as unknown as BrowserWindow;

const tabs: Record<string, Pick<TabState, 'cardKey'>> = { card: { cardKey: 'MPL-1' }, planner: { cardKey: null } };

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F1',
    identity: { kind: 'code', class: 'command-injection', file: 'src/main/x.ts', hash: '0123456789abcdef' },
    line: 42,
    severity: 'high',
    sources: ['security-pass'],
    title: 'Branch name reaches a shell',
    what: 'w',
    how: 'h',
    impact: 'i',
    defense: 'd',
    chips: [],
    applied: null,
    decision: null,
    severityOverride: null,
    ...overrides,
  };
}

function statusOf(dot: TabStatus['dot']): TabStatus {
  return { tabId: 'card', dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null };
}

function register(findingsDir: string, statuses: TabStatus[] = []) {
  registerFindings(
    {
      window: () => win,
      worktreeFor: () => null,
      project: () => Promise.resolve(null),
      sessions: { get: (tabId: string) => (tabId in tabs ? tabs[tabId] : null) } as SessionManager,
      terminals: {} as Terminals,
      status: { statuses: () => statuses } as unknown as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      configLoaded: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
      setSeen: () => Promise.resolve(),
      seen: () => Promise.resolve({}),
      startQueue: new EventEmitter() as StartQueue,
      prs: { latest: () => Promise.resolve({ data: null, error: null, fetchedAt: null }), refresh: () => undefined },
      jira: new Promise<never>(() => undefined),
      jiraCreds: new Promise<never>(() => undefined),
      watchVault: () => undefined,
      findingsDir,
    },
    logger,
  );
  return (channel: string, ...args: unknown[]): unknown => {
    const call = handle.mock.calls.find(([name]) => name === channel);
    if (!call) {
      throw new Error(`finding handler: ${channel} is not registered`);
    }
    return call[1]({} as IpcMainInvokeEvent, ...args);
  };
}

const file = {
  version: 1,
  card: 'MPL-1',
  round: 1,
  headSha: 'a'.repeat(40),
  updatedAt: '2026-11-12T12:00:00.000Z',
  resume: null,
  findings: [],
};

describe('registerFindings', () => {
  let dir = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await mkdtemp(join(tmpdir(), 'maple-findings-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('findings:get reads the tab card file', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify(file));
    const invoke = register(dir);
    // when
    const got = await invoke('findings:get', 'card');
    // then
    expect(got).toEqual({ data: file, error: null, fetchedAt: expect.any(String) as string });
  });

  test('findings:get returns the error text for a bad file', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, version: 2 }));
    const invoke = register(dir);
    // when
    const got = await invoke('findings:get', 'card');
    // then
    expect(got).toEqual({ data: null, error: 'reading findings: MPL-1.json is from a newer Maple', fetchedAt: null });
  });

  test('findings:get returns no data for a planner tab', async () => {
    // given
    const invoke = register(dir);
    // when
    const got = await invoke('findings:get', 'planner');
    // then
    expect(got).toEqual({ data: null, error: null, fetchedAt: null });
  });

  test('a findings dir that cannot be watched logs a warning and still reads', async () => {
    // given
    watch.watchWorktrees.mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify(file));
    // when
    const invoke = register(dir);
    const got = await invoke('findings:get', 'card');
    // then
    expect(logger.warn).toHaveBeenCalledWith('findings', 'failed', {
      operation: 'watchWorktrees',
      args: [dir],
      error: 'ENOENT: no such file or directory',
    });
    expect(got).toMatchObject({ data: file, error: null });
  });

  test('a change in the findings dir sends findings:changed', () => {
    // given
    register(dir);
    // when
    watch.state.changed();
    // then
    expect(watch.state.dir).toBe(dir);
    expect(sendToWindow).toHaveBeenCalledWith('findings:changed');
  });

  test('findings:decide saves the decision', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, findings: [finding({ id: 'F1' })] }));
    const invoke = register(dir, [statusOf('idle')]);
    // when
    await invoke('findings:decide', 'card', 'F1', { kind: 'accept-risk', reason: 'Only Taylor runs it' });
    // then
    const saved = JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8')) as typeof file;
    expect(saved.findings).toEqual([
      finding({
        id: 'F1',
        decision: { kind: 'accept-risk', reason: 'Only Taylor runs it', decidedAt: expect.any(String) as string },
      }),
    ]);
  });

  test('findings:decide refuses while the tab is working', async () => {
    // given
    const before = JSON.stringify({ ...file, findings: [finding({ id: 'F1' })] });
    await writeFile(join(dir, 'MPL-1.json'), before);
    const invoke = register(dir, [statusOf('working')]);
    // when
    const run = invoke('findings:decide', 'card', 'F1', { kind: 'fix-now', reason: null });
    // then
    await expect(run).rejects.toThrow('deciding finding: Claude is working');
    expect(await readFile(join(dir, 'MPL-1.json'), 'utf8')).toBe(before);
  });

  test.each([
    {
      name: 'an unknown finding',
      tabId: 'card',
      saved: { ...file, findings: [finding({ id: 'F1' })] },
      id: 'F3',
      error: 'deciding finding: no finding F3 on MPL-1',
    },
    { name: 'a missing file', tabId: 'card', saved: null, id: 'F1', error: 'deciding finding: no findings for MPL-1' },
    { name: 'a tab with no card', tabId: 'planner', saved: null, id: 'F1', error: 'deciding finding: tab has no card' },
    {
      name: 'a file for another card',
      tabId: 'card',
      saved: { ...file, card: 'MPL-2', findings: [finding({ id: 'F1' })] },
      id: 'F1',
      error: 'deciding finding: MPL-1.json is for MPL-2',
    },
    {
      name: 'a round Claude is applying',
      tabId: 'card',
      saved: { ...file, resume: { round: 1, sentAt: '2026-11-12T12:10:00.000Z' }, findings: [finding({ id: 'F1' })] },
      id: 'F1',
      error: 'deciding finding: Claude is applying your decisions',
    },
  ])('findings:decide refuses $name and logs it', async ({ tabId, saved, id, error }) => {
    // given
    if (saved !== null) {
      await writeFile(join(dir, 'MPL-1.json'), JSON.stringify(saved));
    }
    const invoke = register(dir);
    // when
    const run = invoke('findings:decide', tabId, id, { kind: 'fix-now', reason: null });
    // then
    await expect(run).rejects.toThrow(error);
    expect(logger.warn).toHaveBeenCalledWith('findings', 'failed', { operation: 'findings:decide', tabId, error });
  });

  test('findings:decide with null clears the decision', async () => {
    // given
    const decision = { kind: 'fix-now' as const, reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, findings: [finding({ id: 'F1', decision })] }));
    const invoke = register(dir);
    // when
    await invoke('findings:decide', 'card', 'F1', null);
    // then
    const saved = JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8')) as typeof file;
    expect(saved.findings).toEqual([finding({ id: 'F1' })]);
  });

  test('findings:decide keeps fields and chips Maple does not know', async () => {
    // given
    const raw = {
      ...file,
      extra: { kept: true },
      findings: [{ ...finding({ id: 'F1' }), chips: ['runs-code', 'future-chip'], note: 'kept' }],
    };
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify(raw));
    const invoke = register(dir);
    // when
    await invoke('findings:decide', 'card', 'F1', { kind: 'not-real', reason: null });
    // then
    const saved = JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8')) as typeof raw;
    expect(saved).toEqual({
      ...raw,
      findings: [
        { ...raw.findings[0], decision: { kind: 'not-real', reason: null, decidedAt: expect.any(String) as string } },
      ],
    });
  });

  test('two decisions sent together are both saved', async () => {
    // given
    const findings = [finding({ id: 'F1' }), finding({ id: 'F2' })];
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, findings }));
    const invoke = register(dir);
    // when
    await Promise.all([
      invoke('findings:decide', 'card', 'F1', { kind: 'fix-now', reason: null }),
      invoke('findings:decide', 'card', 'F2', { kind: 'not-real', reason: null }),
    ]);
    // then
    const saved = JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8')) as { findings: Finding[] };
    expect(saved.findings.map((f) => f.decision?.kind)).toEqual(['fix-now', 'not-real']);
  });

  test.each([
    { name: 'an unknown kind', decision: { kind: 'ignore', reason: null } },
    { name: 'a reason over 500 characters', decision: { kind: 'accept-risk', reason: 'x'.repeat(501) } },
    { name: 'an empty reason', decision: { kind: 'accept-risk', reason: '' } },
  ])('findings:decide rejects $name', ({ decision }) => {
    // given
    const invoke = register(dir);
    // when
    const run = () => invoke('findings:decide', 'card', 'F1', decision);
    // then
    expect(run).toThrow('handling findings:decide: arguments are invalid');
  });

  test('findings:override saves the severity', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, findings: [finding({ id: 'F1' })] }));
    const invoke = register(dir);
    // when
    await invoke('findings:override', 'card', 'F1', 'low');
    // then
    const saved = JSON.parse(await readFile(join(dir, 'MPL-1.json'), 'utf8')) as typeof file;
    expect(saved.findings).toEqual([finding({ id: 'F1', severityOverride: 'low' })]);
  });

  test('findings:override rejects an unknown severity', () => {
    // given
    const invoke = register(dir);
    // when
    const run = () => invoke('findings:override', 'card', 'F1', 'critical');
    // then
    expect(run).toThrow('handling findings:override: arguments are invalid');
  });

  test('findings:override refuses while the tab is working', async () => {
    // given
    await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, findings: [finding({ id: 'F1' })] }));
    const invoke = register(dir, [statusOf('working')]);
    // when
    const run = invoke('findings:override', 'card', 'F1', 'low');
    // then
    await expect(run).rejects.toThrow('overriding severity: Claude is working');
  });

  test.each([{ channel: 'findings:decide' }, { channel: 'findings:override' }])(
    '$channel is recorded as a UI action',
    async ({ channel }) => {
      // given
      await writeFile(join(dir, 'MPL-1.json'), JSON.stringify({ ...file, findings: [finding({ id: 'F1' })] }));
      const append = vi.fn<(refs: EventRefs, data: UiActionData) => Promise<void>>(() => Promise.resolve());
      const tab: TabState = {
        id: 'card',
        projectKey: 'MPL',
        kind: 'card',
        cardKey: 'MPL-1',
        sessionId: 's1',
        worktreePath: null,
        worktreePaths: [],
      };
      recordActions(
        uiActionRecorder({ tab: () => tab, actions: () => [], closeNeedsConfirm: () => false, append }, logger),
      );
      const invoke = register(dir);
      // when
      await invoke(channel, 'card', 'F1', channel === 'findings:decide' ? { kind: 'fix-now', reason: null } : 'low');
      // then
      await vi.waitFor(() => {
        expect(append).toHaveBeenCalledWith(
          { project: 'MPL', card: 'MPL-1', tab: 'card', session: 's1' },
          { channel, action: null, length: null },
        );
      });
      recordActions(() => undefined);
    },
  );
});
