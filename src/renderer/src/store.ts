import type { Fetched, MapleConfig, PreflightProblem, TabState, TabStatus, Unsubscribe } from '@shared/types';
import { create } from 'zustand';

type MapleState = {
  config: Fetched<MapleConfig> | null;
  problems: PreflightProblem[];
  projectKey: string | null;
  tabs: TabState[];
  statuses: Record<string, TabStatus>;
  activeTabId: string | null;
  lastActive: Record<string, string | null>;
  init: () => Promise<void>;
  selectProject: (key: string) => void;
  activate: (tabId: string | null) => void;
  setTabs: (tabs: TabState[]) => void;
  setStatus: (s: TabStatus) => void;
};

let unsubscribes: Unsubscribe[] = [];

function firstProject(config: Fetched<MapleConfig>): string | null {
  return config.data?.projects[0]?.jiraKey ?? null;
}

export const useMaple = create<MapleState>()((set, get) => ({
  config: null,
  problems: [],
  projectKey: null,
  tabs: [],
  statuses: {},
  activeTabId: null,
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
    const [config, problems, tabs, statuses] = await Promise.all([
      maple.config.get(),
      maple.preflight.run(),
      maple.tabs.list().catch((): TabState[] => []),
      maple.tabs.statuses().catch((): TabStatus[] => []),
    ]);
    set({
      config,
      problems,
      tabs,
      statuses: Object.fromEntries(statuses.map((s) => [s.tabId, s])),
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
    if (tabId !== null) {
      window.maple.tabs.setActive(tabId);
    }
  },

  setTabs(tabs) {
    const { activeTabId } = get();
    set({ tabs, activeTabId: tabs.some((t) => t.id === activeTabId) ? activeTabId : null });
  },

  setStatus(s) {
    set({ statuses: { ...get().statuses, [s.tabId]: s } });
  },
}));
