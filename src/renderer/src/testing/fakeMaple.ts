import type { MapleApi } from '@shared/api/mapleApi';
import type { Fetched } from '@shared/types/app/fetched';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import { vi } from 'vitest';

type FakeOverrides = { [A in keyof MapleApi]?: Partial<MapleApi[A]> };

export const FAKE_CONFIG: Fetched<MapleConfig> = {
  data: {
    worktreesDir: '/tmp/wts',
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
    projects: [
      {
        name: 'Bearclave',
        jiraKey: 'BEAR',
        jiraBoardId: 1,
        plannerDir: '/tmp/planner/bear',
        repo: 'tahardi/bearclave',
        otherRepos: [],
      },
      {
        name: 'Dig Days',
        jiraKey: 'DIG',
        jiraBoardId: 2,
        plannerDir: '/tmp/planner/dig',
        repo: 'tahardi/dig-days',
        otherRepos: [],
      },
    ],
    actions: [],
  },
  error: null,
  fetchedAt: '2026-10-18T12:00:00.000Z',
};

const unsubscribe = () => vi.fn();

export function fakeMaple(overrides: FakeOverrides = {}): MapleApi {
  const maple: MapleApi = {
    config: {
      get: vi.fn(() => Promise.resolve(FAKE_CONFIG)),
      reload: vi.fn(() => Promise.resolve(FAKE_CONFIG)),
      onChanged: vi.fn(unsubscribe),
      ...overrides.config,
    },
    preflight: {
      run: vi.fn(() => Promise.resolve([])),
      ...overrides.preflight,
    },
    jira: {
      sprint: vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null })),
      backlog: vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null })),
      moveToSprint: vi.fn(() => Promise.resolve()),
      report: vi.fn(() => Promise.reject(new Error('filing report: not faked'))),
      ...overrides.jira,
    },
    tabs: {
      list: vi.fn(() => Promise.resolve([])),
      startCard: vi.fn(() => Promise.reject(new Error('starting card: not faked'))),
      openCard: vi.fn(() => Promise.reject(new Error('opening card: not faked'))),
      openPlanner: vi.fn((projectKey: string) =>
        Promise.resolve({
          id: `planner-${projectKey}`,
          projectKey,
          kind: 'planner' as const,
          cardKey: null,
          sessionId: `s-planner-${projectKey}`,
          worktreePath: null,
          worktreePaths: [],
        }),
      ),
      openVault: vi.fn((projectKey: string) =>
        Promise.resolve({
          id: `vault-${projectKey}`,
          projectKey,
          kind: 'vault' as const,
          cardKey: null,
          sessionId: `s-vault-${projectKey}`,
          worktreePath: null,
          worktreePaths: [],
        }),
      ),
      openLearning: vi.fn((projectKey: string) =>
        Promise.resolve({
          id: `learning-${projectKey}`,
          projectKey,
          kind: 'learning' as const,
          cardKey: null,
          sessionId: `s-learning-${projectKey}`,
          worktreePath: null,
          worktreePaths: [],
        }),
      ),
      close: vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false })),
      resume: vi.fn(() => Promise.resolve()),
      startFresh: vi.fn(() => Promise.resolve()),
      selectWorktree: vi.fn(() => Promise.resolve()),
      setActive: vi.fn(),
      statuses: vi.fn(() => Promise.resolve([])),
      cost: vi.fn<(tabId: string) => Promise<SessionCost | null>>(() => Promise.resolve(null)),
      onStatus: vi.fn(unsubscribe),
      onChanged: vi.fn(unsubscribe),
      onActivate: vi.fn(unsubscribe),
      startQueue: vi.fn(() =>
        Promise.resolve({ cards: [], working: 0, limit: 4, waitingFor: null, gapSeconds: 90, failure: null }),
      ),
      unqueue: vi.fn(() => Promise.resolve()),
      moveQueued: vi.fn(() => Promise.resolve()),
      onQueue: vi.fn(unsubscribe),
      ...overrides.tabs,
    },
    session: {
      write: vi.fn(),
      resize: vi.fn(),
      sendPrompt: vi.fn(),
      backlog: vi.fn(() => Promise.resolve('')),
      onData: vi.fn(unsubscribe),
      onBatch: vi.fn(unsubscribe),
      ...overrides.session,
    },
    terminal: {
      open: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      write: vi.fn(),
      resize: vi.fn(),
      backlog: vi.fn(() => Promise.resolve('')),
      onData: vi.fn(unsubscribe),
      onExit: vi.fn(unsubscribe),
      ...overrides.terminal,
    },
    repo: {
      changes: vi.fn(() => Promise.resolve(null)),
      listFiles: vi.fn(() => Promise.resolve([])),
      info: vi.fn(() => Promise.resolve(null)),
      readFile: vi.fn((_tabId: string, path: string) => Promise.resolve({ kind: 'binary' as const, path })),
      writeFile: vi.fn(() => Promise.resolve()),
      search: vi.fn(() => Promise.resolve([])),
      onChanged: vi.fn(unsubscribe),
      ...overrides.repo,
    },
    vault: {
      list: vi.fn(() => Promise.resolve([])),
      read: vi.fn(() => Promise.resolve('')),
      written: vi.fn(() => Promise.resolve([])),
      before: vi.fn(() => Promise.resolve(null)),
      write: vi.fn(() => Promise.resolve()),
      onChanged: vi.fn(unsubscribe),
      ...overrides.vault,
    },
    learning: {
      list: vi.fn(() => Promise.resolve([])),
      setComfortable: vi.fn(() => Promise.resolve()),
      ...overrides.learning,
    },
    pr: {
      get: vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null })),
      approve: vi.fn(() => Promise.resolve()),
      review: vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null })),
      readFile: vi.fn((_tabId: string, path: string) => Promise.resolve({ kind: 'binary' as const, path })),
      comment: vi.fn(() => Promise.resolve()),
      reply: vi.fn(() => Promise.resolve()),
      resolve: vi.fn(() => Promise.resolve()),
      comments: vi.fn(() => Promise.resolve([])),
      diffLines: vi.fn(() => Promise.resolve({ ranges: {} })),
      ...overrides.pr,
    },
    app: {
      setNotifications: vi.fn(() => Promise.resolve()),
      warnings: vi.fn(() => Promise.resolve([])),
      setLastProject: vi.fn(() => Promise.resolve()),
      lastProject: vi.fn(() => Promise.resolve(null)),
      setSeen: vi.fn(() => Promise.resolve()),
      seen: vi.fn(() => Promise.resolve({})),
      onQuitRequested: vi.fn(unsubscribe),
      confirmQuit: vi.fn(),
      onReportRequested: vi.fn(unsubscribe),
      onShortcutsRequested: vi.fn(unsubscribe),
      ...overrides.app,
    },
  };
  window.maple = maple;
  return maple;
}
