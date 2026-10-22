import type { Dot, TabKind, TabState, TabStatus } from './types/tabs';
import type { JiraStatus } from './types/jira';
import type { PrInfo } from './types/github';

export type DotInput =
  | { type: 'prompt' }
  | { type: 'permission' }
  | { type: 'stop'; kind: TabKind; cardStatus: JiraStatus | null; pr: PrInfo | null };

function stopDot(cardStatus: JiraStatus | null, pr: PrInfo | null): Dot {
  if (cardStatus === 'Done') {
    return 'merged';
  }
  const reviewable = cardStatus === 'In Review' && pr?.state === 'OPEN' && pr.checks.failed === 0;
  return reviewable ? 'ready' : 'waiting';
}

export function nextDot(input: DotInput): Dot {
  switch (input.type) {
    case 'prompt':
      return 'working';
    case 'permission':
      return 'waiting';
    case 'stop':
      return input.kind === 'planner' ? 'idle' : stopDot(input.cardStatus, input.pr);
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
