import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { shouldNotify } from './notify';

export type NotifyDeps = {
  tab: (tabId: string) => TabState | null;
  focused: () => boolean;
  activeTabId: () => string | null;
  enabled: () => Promise<boolean>;
  project: (projectKey: string) => Promise<ProjectConfig | null>;
  notify: (tab: TabState, projectName: string) => void;
};

export async function notifyIfNeeded(deps: NotifyDeps, status: TabStatus, prev: Dot): Promise<void> {
  const tab = deps.tab(status.tabId);
  if (!tab) {
    return;
  }
  const focused = deps.focused();
  const activeTabId = deps.activeTabId();
  if (!shouldNotify(status.dot, prev, focused, activeTabId, tab.id, await deps.enabled())) {
    return;
  }
  const project = await deps.project(tab.projectKey);
  deps.notify(tab, project?.name ?? tab.projectKey);
}
