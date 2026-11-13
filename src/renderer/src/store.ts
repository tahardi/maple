import type { Draft } from '@shared/types/files/draft';
import type { Fetched } from '@shared/types/app/fetched';
import type { PreflightProblem } from '@shared/types/app/preflightProblem';
import type { Unsubscribe } from '@shared/types/app/unsubscribe';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { create } from 'zustand';

type MapleState = {
  config: Fetched<MapleConfig> | null;
  problems: PreflightProblem[];
  warnings: string[];
  projectKey: string | null;
  tabs: TabState[];
  statuses: Record<string, TabStatus>;
  since: Record<string, number>;
  seen: Record<string, Dot>;
  activeTabId: string | null;
  confirmClose: string | null;
  lastActive: Record<string, string | null>;
  drafts: Record<string, Record<string, Draft>>;
  lessonNote: string | null;
  init: () => Promise<void>;
  selectProject: (key: string, tabId?: string | null) => void;
  activate: (tabId: string | null) => void;
  markSeen: (tabIds: readonly string[]) => void;
  setTabs: (tabs: TabState[]) => void;
  setStatus: (s: TabStatus) => void;
  closeTab: (tabId: string, force: boolean) => Promise<void>;
  cancelClose: () => void;
  setDraft: (tabId: string, path: string, draft: Draft | null) => void;
  showLesson: (tabId: string, note: string) => void;
  selectLesson: (note: string | null) => void;
};

let unsubscribes: Unsubscribe[] = [];

function inView(tab: TabState, projectKey: string | null, activeTabId: string | null): boolean {
  return activeTabId === null ? tab.kind === 'planner' && tab.projectKey === projectKey : tab.id === activeTabId;
}

function saveSeen(seen: Record<string, Dot>): void {
  window.maple.app.setSeen(seen).catch(() => undefined);
}

function firstProject(config: Fetched<MapleConfig>): string | null {
  return config.data?.projects[0]?.jiraKey ?? null;
}

export const useMaple = create<MapleState>()((set, get) => ({
  config: null,
  problems: [],
  warnings: [],
  projectKey: null,
  tabs: [],
  statuses: {},
  since: {},
  seen: {},
  activeTabId: null,
  confirmClose: null,
  lastActive: {},
  drafts: {},
  lessonNote: null,

  async init() {
    const { maple } = window;
    unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
    unsubscribes = [
      maple.tabs.onChanged((tabs) => {
        get().setTabs(tabs);
      }),
      maple.tabs.onStatus((s) => {
        get().setStatus(s);
      }),
      maple.tabs.onActivate((tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        if (tab && tab.projectKey !== get().projectKey) {
          get().selectProject(tab.projectKey, tabId);
          return;
        }
        get().activate(tabId);
      }),
      maple.config.onChanged((config) => {
        const keys = config.data?.projects.map((p) => p.jiraKey) ?? [];
        const current = get().projectKey;
        set({ config, projectKey: current !== null && keys.includes(current) ? current : firstProject(config) });
      }),
    ];
    const [config, problems, warnings, tabs, statuses, lastProject, seen] = await Promise.all([
      maple.config.get(),
      maple.preflight.run(),
      maple.app.warnings().catch((): string[] => []),
      maple.tabs.list().catch((): TabState[] => []),
      maple.tabs.statuses().catch((): TabStatus[] => []),
      maple.app.lastProject().catch(() => null),
      maple.app.seen().catch((): Record<string, Dot> => ({})),
    ]);
    const keys = config.data?.projects.map((p) => p.jiraKey) ?? [];
    const live = get();
    const current = { ...Object.fromEntries(statuses.map((s) => [s.tabId, s])), ...live.statuses };
    const kept = Object.fromEntries(
      Object.entries(seen).filter(([id]) => !Object.hasOwn(current, id) || current[id].dot !== 'working'),
    );
    set({
      config,
      problems,
      warnings,
      tabs,
      statuses: current,
      since: { ...Object.fromEntries(statuses.map((s) => [s.tabId, Date.now()])), ...live.since },
      seen: kept,
      projectKey: lastProject !== null && keys.includes(lastProject) ? lastProject : firstProject(config),
      activeTabId: null,
    });
    if (Object.keys(kept).length !== Object.keys(seen).length) {
      saveSeen(kept);
    }
  },

  selectProject(key, tabId) {
    const { lastActive, tabs } = get();
    const target = tabId === undefined ? (lastActive[key] ?? null) : tabId;
    set({ projectKey: key });
    window.maple.app.setLastProject(key).catch(() => undefined);
    get().activate(tabs.some((t) => t.id === target) ? target : null);
  },

  showLesson(tabId, note) {
    set({ lessonNote: note });
    get().activate(tabId);
  },

  selectLesson(note) {
    set({ lessonNote: note });
  },

  activate(tabId) {
    const { projectKey, lastActive, tabs, markSeen } = get();
    set({
      activeTabId: tabId,
      lastActive: projectKey === null ? lastActive : { ...lastActive, [projectKey]: tabId },
    });
    markSeen(tabs.filter((t) => inView(t, projectKey, tabId)).map((t) => t.id));
    window.maple.tabs.setActive(tabId);
  },

  markSeen(tabIds) {
    const { statuses, seen } = get();
    const fresh = tabIds.filter(
      (id) => Object.hasOwn(statuses, id) && statuses[id].dot !== 'idle' && seen[id] !== statuses[id].dot,
    );
    if (fresh.length === 0) {
      return;
    }
    const next = { ...seen, ...Object.fromEntries(fresh.map((id) => [id, statuses[id].dot])) };
    set({ seen: next });
    saveSeen(next);
  },

  setTabs(tabs) {
    const { activeTabId } = get();
    set({ tabs, activeTabId: tabs.some((t) => t.id === activeTabId) ? activeTabId : null });
  },

  setStatus(s) {
    const { statuses, since, seen, tabs, projectKey, activeTabId } = get();
    const changed = !Object.hasOwn(statuses, s.tabId) || statuses[s.tabId].dot !== s.dot;
    const now = Date.now();
    const viewed = tabs.some((t) => t.id === s.tabId && inView(t, projectKey, activeTabId));
    let nextSeen = seen;
    if (changed && viewed && s.dot !== 'idle') {
      nextSeen = { ...seen, [s.tabId]: s.dot };
    } else if (changed && s.dot === 'working' && Object.hasOwn(seen, s.tabId)) {
      nextSeen = Object.fromEntries(Object.entries(seen).filter(([id]) => id !== s.tabId));
    }
    set({
      statuses: { ...statuses, [s.tabId]: s },
      since: changed ? { ...since, [s.tabId]: now } : since,
      seen: nextSeen,
    });
    if (nextSeen !== seen) {
      saveSeen(nextSeen);
    }
  },

  async closeTab(tabId, force) {
    const { needsConfirm } = await window.maple.tabs.close(tabId, force);
    set({ confirmClose: needsConfirm ? tabId : null });
  },

  cancelClose() {
    set({ confirmClose: null });
  },

  setDraft(tabId, path, draft) {
    const { drafts } = get();
    const rest = Object.fromEntries(Object.entries(drafts[tabId] ?? {}).filter(([p]) => p !== path));
    set({ drafts: { ...drafts, [tabId]: draft === null ? rest : { ...rest, [path]: draft } } });
  },
}));
