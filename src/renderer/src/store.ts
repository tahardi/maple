import type { Draft, Fetched, MapleConfig, PreflightProblem, TabState, TabStatus, Unsubscribe } from '@shared/types';
import { create } from 'zustand';

type MapleState = {
  config: Fetched<MapleConfig> | null;
  problems: PreflightProblem[];
  warnings: string[];
  projectKey: string | null;
  tabs: TabState[];
  statuses: Record<string, TabStatus>;
  since: Record<string, number>;
  seen: Record<string, number>;
  activeTabId: string | null;
  confirmClose: string | null;
  lastActive: Record<string, string | null>;
  drafts: Record<string, Record<string, Draft>>;
  init: () => Promise<void>;
  selectProject: (key: string) => void;
  activate: (tabId: string | null) => void;
  setTabs: (tabs: TabState[]) => void;
  setStatus: (s: TabStatus) => void;
  closeTab: (tabId: string, force: boolean) => Promise<void>;
  cancelClose: () => void;
  setDraft: (tabId: string, path: string, draft: Draft | null) => void;
};

let unsubscribes: Unsubscribe[] = [];

function inView(tab: TabState, projectKey: string | null, activeTabId: string | null): boolean {
  return activeTabId === null ? tab.kind === 'planner' && tab.projectKey === projectKey : tab.id === activeTabId;
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
          get().selectProject(tab.projectKey);
        }
        get().activate(tabId);
      }),
      maple.config.onChanged((config) => {
        const keys = config.data?.projects.map((p) => p.jiraKey) ?? [];
        const current = get().projectKey;
        set({ config, projectKey: current !== null && keys.includes(current) ? current : firstProject(config) });
      }),
    ];
    const [config, problems, warnings, tabs, statuses, lastProject] = await Promise.all([
      maple.config.get(),
      maple.preflight.run(),
      maple.app.warnings().catch((): string[] => []),
      maple.tabs.list().catch((): TabState[] => []),
      maple.tabs.statuses().catch((): TabStatus[] => []),
      maple.app.lastProject().catch(() => null),
    ]);
    const keys = config.data?.projects.map((p) => p.jiraKey) ?? [];
    set({
      config,
      problems,
      warnings,
      tabs,
      statuses: Object.fromEntries(statuses.map((s) => [s.tabId, s])),
      since: Object.fromEntries(statuses.map((s) => [s.tabId, Date.now()])),
      projectKey: lastProject !== null && keys.includes(lastProject) ? lastProject : firstProject(config),
      activeTabId: null,
    });
  },

  selectProject(key) {
    const { lastActive, tabs } = get();
    const last = lastActive[key] ?? null;
    set({ projectKey: key });
    window.maple.app.setLastProject(key).catch(() => undefined);
    get().activate(tabs.some((t) => t.id === last) ? last : null);
  },

  activate(tabId) {
    const { projectKey, lastActive, tabs, seen } = get();
    const now = Date.now();
    const viewed = tabs.filter((t) => inView(t, projectKey, tabId)).map((t): [string, number] => [t.id, now]);
    set({
      activeTabId: tabId,
      lastActive: projectKey === null ? lastActive : { ...lastActive, [projectKey]: tabId },
      seen: { ...seen, ...Object.fromEntries(viewed) },
    });
    window.maple.tabs.setActive(tabId);
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
    set({
      statuses: { ...statuses, [s.tabId]: s },
      since: changed ? { ...since, [s.tabId]: now } : since,
      seen: changed && viewed ? { ...seen, [s.tabId]: now } : seen,
    });
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
