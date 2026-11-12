import type { Dot } from '@shared/types/tabs/dot';
import type { TabKind, TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import type { JiraStatus } from '@shared/types/jira/jiraStatus';
import type { PrInfo } from '@shared/types/github/prInfo';

export const DOT_LABELS: Record<Dot, string> = {
  working: 'Working',
  waiting: 'Needs you',
  ready: 'Ready for review',
  merged: 'Merged',
  idle: 'Idle',
};

export const SETTLED_DOTS: readonly Dot[] = ['idle', 'ready', 'merged', 'waiting'];

export type DotInput =
  | { type: 'prompt' }
  | { type: 'permission' }
  | { type: 'background' }
  | { type: 'stop'; kind: TabKind; cardStatus: JiraStatus | null; prs: readonly PrInfo[] };

function stopDot(cardStatus: JiraStatus | null, prs: readonly PrInfo[]): Dot {
  if (cardStatus === 'Done') {
    return 'merged';
  }
  const open = prs.filter((p) => p.state === 'OPEN');
  const reviewable = cardStatus === 'In Review' && open.length > 0 && open.every((p) => p.checks.failed === 0);
  return reviewable ? 'ready' : 'waiting';
}

export function nextDot(input: DotInput): Dot {
  switch (input.type) {
    case 'prompt':
    case 'background':
      return 'working';
    case 'permission':
      return 'waiting';
    case 'stop':
      return input.kind === 'planner' ? 'idle' : stopDot(input.cardStatus, input.prs);
  }
}

export function projectCounts(
  tabs: TabState[],
  statuses: TabStatus[],
): Record<string, { waiting: number; ready: number }> {
  const dots = new Map(statuses.map((s) => [s.tabId, s.dot]));
  const counts: Record<string, { waiting: number; ready: number }> = {};
  for (const tab of tabs) {
    const count = (counts[tab.projectKey] ??= { waiting: 0, ready: 0 });
    const dot = dots.get(tab.id);
    if (dot === 'waiting' || dot === 'ready') {
      count[dot] += 1;
    }
  }
  return counts;
}
