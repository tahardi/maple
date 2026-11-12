import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StartQueue } from '@main/sessions/StartQueue';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import type { Terminals } from '@main/sessions/Terminals';
import type { TabState } from '@shared/types/tabs/tabState';
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

function register(findingsDir: string) {
  registerFindings(
    {
      window: () => win,
      worktreeFor: () => null,
      project: () => Promise.resolve(null),
      sessions: { get: (tabId: string) => (tabId in tabs ? tabs[tabId] : null) } as SessionManager,
      terminals: {} as Terminals,
      status: {} as StatusEngine,
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

  test('a change in the findings dir sends findings:changed', () => {
    // given
    register(dir);
    // when
    watch.state.changed();
    // then
    expect(watch.state.dir).toBe(dir);
    expect(sendToWindow).toHaveBeenCalledWith('findings:changed');
  });
});
