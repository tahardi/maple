import type { TabKind, TabState, TabStatus } from './types/tabs';

export type InboxItem = {
  tabId: string;
  projectKey: string;
  kind: TabKind;
  cardKey: string | null;
  dot: 'waiting' | 'ready';
  since: number;
  points: number | null;
};

export function inboxItems(
  tabs: TabState[],
  statuses: TabStatus[],
  since: Record<string, number>,
  seen: Record<string, number>,
  points: Record<string, number | null>,
): InboxItem[] {
  const dots = new Map(statuses.map((s) => [s.tabId, s.dot]));
  const items: InboxItem[] = [];
  for (const tab of tabs) {
    const dot = dots.get(tab.id);
    const changed = Object.hasOwn(since, tab.id) ? since[tab.id] : 0;
    if ((dot !== 'waiting' && dot !== 'ready') || (Object.hasOwn(seen, tab.id) && seen[tab.id] >= changed)) {
      continue;
    }
    items.push({
      tabId: tab.id,
      projectKey: tab.projectKey,
      kind: tab.kind,
      cardKey: tab.cardKey,
      dot,
      since: changed,
      points: tab.cardKey !== null && Object.hasOwn(points, tab.cardKey) ? points[tab.cardKey] : null,
    });
  }
  return items.sort((a, b) => a.since - b.since);
}
