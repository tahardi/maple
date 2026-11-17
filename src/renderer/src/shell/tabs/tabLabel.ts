import type { TabState } from '@shared/types/tabs/tabState';

export function tabLabel(tab: Pick<TabState, 'kind' | 'cardKey'>): string {
  if (tab.cardKey !== null) {
    return tab.cardKey;
  }
  return { vault: 'Vault', learning: 'Learning', planner: 'Planner', card: 'Planner' }[tab.kind];
}
