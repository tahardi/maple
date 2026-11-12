import { describe, expect, test } from 'vitest';
import type { TabState } from '@shared/types/tabs/tabState';
import { TabRegistry } from './TabRegistry';

function tab(id: string, kind: TabState['kind'], cardKey: string | null, sessionId = `s-${id}`): TabState {
  return { id, projectKey: 'DIG', kind, cardKey, sessionId, worktreePath: null, worktreePaths: [] };
}

describe('TabRegistry', () => {
  test('add then get and list return the tab', () => {
    // given
    const registry = new TabRegistry({});
    const card = tab('t1', 'card', 'DIG-44');
    // when
    registry.add(card);
    // then
    expect(registry.get('t1')).toEqual(card);
    expect(registry.list()).toEqual([card]);
  });

  test('get of an unknown tab returns null', () => {
    // given
    const registry = new TabRegistry({});
    // when
    const got = registry.get('t9');
    // then
    expect(got).toBeNull();
  });

  test('require of an unknown tab throws', () => {
    // given
    const registry = new TabRegistry({});
    // when
    const require = () => registry.require('t9');
    // then
    expect(require).toThrow('finding tab: t9 does not exist');
  });

  test('update replaces the tab with the same id', () => {
    // given
    const registry = new TabRegistry({});
    registry.add(tab('t1', 'card', 'DIG-44'));
    const updated = tab('t1', 'card', 'DIG-44', 's-new');
    // when
    registry.update(updated);
    // then
    expect(registry.list()).toEqual([updated]);
  });

  test('findCard and findKind find open tabs of the project', () => {
    // given
    const registry = new TabRegistry({});
    const card = tab('t1', 'card', 'DIG-44');
    const planner = tab('t2', 'planner', null);
    registry.add(card);
    registry.add(planner);
    // when
    const got = [
      registry.findCard('DIG', 'DIG-44'),
      registry.findCard('HALO', 'DIG-44'),
      registry.findKind('DIG', 'planner'),
      registry.findKind('DIG', 'vault'),
    ];
    // then
    expect(got).toEqual([card, null, planner, null]);
  });

  test('close of a card tab records its session for sessionOf', () => {
    // given
    const registry = new TabRegistry({});
    const card = tab('t1', 'card', 'DIG-44');
    registry.add(card);
    // when
    const closed = registry.close('t1');
    // then
    expect(closed).toEqual(card);
    expect(registry.get('t1')).toBeNull();
    expect(registry.sessionOf('DIG-44')).toBe('s-t1');
  });

  test('close of a planner tab records no closed session', () => {
    // given
    const registry = new TabRegistry({});
    registry.add(tab('t1', 'planner', null));
    // when
    registry.close('t1');
    // then
    expect(registry.snapshot().closedSessions).toEqual({});
  });

  test('drop removes a tab without recording a closed session', () => {
    // given
    const registry = new TabRegistry({});
    registry.add(tab('t1', 'card', 'DIG-44'));
    // when
    registry.drop('t1');
    // then
    expect(registry.list()).toEqual([]);
    expect(registry.sessionOf('DIG-44')).toBeNull();
  });

  test('forgetKept forgets the kept tab of the same kind, project, and card', () => {
    // given
    const registry = new TabRegistry({});
    const keptCard = tab('old-1', 'card', 'DIG-44');
    const keptOther = tab('old-2', 'card', 'DIG-45');
    const keptPlanner = tab('old-3', 'planner', null);
    registry.keep(keptCard);
    registry.keep(keptOther);
    registry.keep(keptPlanner);
    const card = tab('t1', 'card', 'DIG-44');
    registry.add(card);
    // when
    registry.forgetKept(card);
    // then
    expect(registry.snapshot().tabs).toEqual([card, keptOther, keptPlanner]);
  });

  test.each([
    { name: 'the kept session over a closed one', keptCard: 'DIG-44', closed: true, want: 's-old' },
    { name: 'the closed session when another card is kept', keptCard: 'DIG-45', closed: true, want: 'closed' },
    { name: 'null when neither exists', keptCard: 'DIG-45', closed: false, want: null },
  ])('resumeIdFor returns $name', ({ keptCard, closed, want }) => {
    // given
    const registry = new TabRegistry(closed ? { 'DIG-44': 'closed' } : {});
    registry.keep(tab('old-1', 'card', keptCard, 's-old'));
    // when
    const got = registry.resumeIdFor('DIG', 'DIG-44');
    // then
    expect(got).toBe(want);
  });

  test('snapshot lists open tabs, then kept tabs, and a copy of the closed sessions', () => {
    // given
    const closedSessions = { 'DIG-1': 'old' };
    const registry = new TabRegistry(closedSessions);
    const kept = tab('old-1', 'card', 'DIG-45');
    registry.keep(kept);
    const card = tab('t1', 'card', 'DIG-44');
    registry.add(card);
    // when
    const snapshot = registry.snapshot();
    snapshot.closedSessions['DIG-2'] = 'mutated';
    // then
    expect(snapshot.tabs).toEqual([card, kept]);
    expect(registry.snapshot().closedSessions).toEqual({ 'DIG-1': 'old' });
    expect(closedSessions).toEqual({ 'DIG-1': 'old' });
  });
});
