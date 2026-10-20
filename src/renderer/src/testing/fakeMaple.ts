import type { MapleApi } from '@shared/ipc';
import type { Fetched, MapleConfig, SessionCost } from '@shared/types';
import { vi } from 'vitest';

type FakeOverrides = { [A in keyof MapleApi]?: Partial<MapleApi[A]> };

export const FAKE_CONFIG: Fetched<MapleConfig> = {
  data: {
    worktreesDir: '/tmp/wts',
    vaultDir: null,
    notifications: false,
    projects: [
      { name: 'Bearclave', jiraKey: 'BEAR', jiraBoardId: 1, plannerDir: '/tmp/planner/bear' },
      { name: 'Dig Days', jiraKey: 'DIG', jiraBoardId: 2, plannerDir: '/tmp/planner/dig' },
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
        }),
      ),
      close: vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false })),
      resume: vi.fn(() => Promise.resolve()),
      startFresh: vi.fn(() => Promise.resolve()),
      setActive: vi.fn(),
      statuses: vi.fn(() => Promise.resolve([])),
      cost: vi.fn<(tabId: string) => Promise<SessionCost | null>>(() => Promise.resolve(null)),
      onStatus: vi.fn(unsubscribe),
      onChanged: vi.fn(unsubscribe),
      onActivate: vi.fn(unsubscribe),
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
    repo: {
      changes: vi.fn(() => Promise.resolve(null)),
      listFiles: vi.fn(() => Promise.resolve([])),
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
      ...overrides.vault,
    },
    pr: {
      get: vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null })),
      approve: vi.fn(() => Promise.resolve()),
      ...overrides.pr,
    },
    app: {
      setNotifications: vi.fn(() => Promise.resolve()),
      warnings: vi.fn(() => Promise.resolve([])),
      onQuitRequested: vi.fn(unsubscribe),
      confirmQuit: vi.fn(),
      ...overrides.app,
    },
  };
  window.maple = maple;
  return maple;
}
