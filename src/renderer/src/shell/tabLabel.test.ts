import type { TabKind } from '@shared/types/tabs';
import { tabLabel } from './tabLabel';

describe('tabLabel', () => {
  test.each<{ kind: TabKind; cardKey: string | null; want: string }>([
    { kind: 'card', cardKey: 'BEAR-1', want: 'BEAR-1' },
    { kind: 'vault', cardKey: null, want: 'Vault' },
    { kind: 'planner', cardKey: null, want: 'Planner' },
  ])('labels a $kind tab $want', ({ kind, cardKey, want }) => {
    // given
    const tab = { kind, cardKey };
    // when
    const label = tabLabel(tab);
    // then
    expect(label).toBe(want);
  });
});
