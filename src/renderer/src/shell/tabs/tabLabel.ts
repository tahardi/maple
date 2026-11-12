import type { TabState } from '@shared/types/tabs/tabState';

export function tabLabel(tab: Pick<TabState, 'kind' | 'cardKey'>): string {
  return tab.cardKey ?? (tab.kind === 'vault' ? 'Vault' : 'Planner');
}
