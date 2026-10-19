import type { Fetched, MapleConfig, PreflightProblem, TabState, TabStatus, Unsubscribe } from '@shared/types';
import { create } from 'zustand';

type MapleState = {
  config: Fetched<MapleConfig> | null;
  problems: PreflightProblem[];
  warnings: string[];
  projectKey: string | null;
  tabs: TabState[];
  statuses: Record<string, TabStatus>;
  since: Record<string, number>;
  activeTabId: string | null;
  confirmClose: string | null;
  lastActive: Record<string, string | null>;
  init: () => Promise<void>;
  selectProject: (key: string) => void;
  activate: (tabId: string | null) => void;
  setTabs: (tabs: TabState[]) => void;
  setStatus: (s: TabStatus) => void;
  closeTab: (tabId: string, force: boolean) => Promise<void>;
  cancelClose: () => void;
};

let unsubscribes: Unsubscribe[] = [];

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
  activeTabId: null,
  confirmClose: null,
  lastActive: {},

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
    const [config, problems, warnings, tabs, statuses] = await Promise.all([
      maple.config.get(),
      maple.preflight.run(),
      maple.app.warnings().catch((): string[] => []),
      maple.tabs.list().catch((): TabState[] => []),
      maple.tabs.statuses().catch((): TabStatus[] => []),
    ]);
    set({
      config,
      problems,
      warnings,
      tabs,
      statuses: Object.fromEntries(statuses.map((s) => [s.tabId, s])),
      since: Object.fromEntries(statuses.map((s) => [s.tabId, Date.now()])),
      projectKey: firstProject(config),
      activeTabId: null,
    });
  },

  selectProject(key) {
    const { lastActive, tabs } = get();
    const last = lastActive[key] ?? null;
    set({ projectKey: key });
    get().activate(tabs.some((t) => t.id === last) ? last : null);
  },

  activate(tabId) {
    const { projectKey, lastActive } = get();
    set({
      activeTabId: tabId,
      lastActive: projectKey === null ? lastActive : { ...lastActive, [projectKey]: tabId },
    });
    window.maple.tabs.setActive(tabId);
  },

  setTabs(tabs) {
    const { activeTabId } = get();
    set({ tabs, activeTabId: tabs.some((t) => t.id === activeTabId) ? activeTabId : null });
  },

  setStatus(s) {
    const { statuses, since } = get();
    const changed = !Object.hasOwn(statuses, s.tabId) || statuses[s.tabId].dot !== s.dot;
    set({ statuses: { ...statuses, [s.tabId]: s }, since: changed ? { ...since, [s.tabId]: Date.now() } : since });
  },

  async closeTab(tabId, force) {
    const { needsConfirm } = await window.maple.tabs.close(tabId, force);
    set({ confirmClose: needsConfirm ? tabId : null });
  },

  cancelClose() {
    set({ confirmClose: null });
  },
}));
