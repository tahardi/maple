import type { TabState } from '@shared/types/tabs/tabState';
import { adjacentTab } from './adjacentTab';

const tab = (id: string, projectKey: string, kind: TabState['kind']): TabState => ({
  id,
  projectKey,
  kind,
  cardKey: null,
  sessionId: `s-${id}`,
  worktreePath: null,
  worktreePaths: [],
});

const TABS = [
  tab('t1', 'BEAR', 'card'),
  tab('d1', 'DIG', 'card'),
  tab('p1', 'BEAR', 'planner'),
  tab('t2', 'BEAR', 'card'),
  tab('v1', 'BEAR', 'vault'),
  tab('l1', 'BEAR', 'learning'),
];
const NO_VAULT = TABS.filter((t) => t.kind !== 'vault' && t.kind !== 'learning');

describe('adjacentTab', () => {
  test.each([
    { tabs: TABS, from: null, step: 1 as const, to: 'v1' },
    { tabs: TABS, from: 'v1', step: 1 as const, to: 'l1' },
    { tabs: TABS, from: 'l1', step: 1 as const, to: 't1' },
    { tabs: TABS, from: 't1', step: -1 as const, to: 'l1' },
    { tabs: TABS, from: 't2', step: 1 as const, to: null },
    { tabs: TABS, from: null, step: -1 as const, to: 't2' },
    { tabs: NO_VAULT, from: null, step: 1 as const, to: 't1' },
    { tabs: TABS, from: 'd1', step: 1 as const, to: 'v1' },
  ])('step $step from $from lands on $to', ({ tabs, from, step, to }) => {
    // given
    const projectKey = 'BEAR';
    // when
    const next = adjacentTab(tabs, projectKey, from, step);
    // then
    expect(next).toBe(to);
  });
});
