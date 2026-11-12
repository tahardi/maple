import type { TabState } from '@shared/types/tabs/tabState';

export function adjacentTab(
  tabs: readonly TabState[],
  projectKey: string | null,
  activeTabId: string | null,
  step: 1 | -1,
): string | null {
  const ofProject = tabs.filter((t) => t.projectKey === projectKey);
  const order = [
    null,
    ...ofProject.filter((t) => t.kind === 'vault').map((t) => t.id),
    ...ofProject.filter((t) => t.kind === 'card').map((t) => t.id),
  ];
  const index = Math.max(order.indexOf(activeTabId), 0);
  return order[(index + step + order.length) % order.length];
}
