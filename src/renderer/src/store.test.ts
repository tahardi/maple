import type { TabState } from '@shared/types';
import { useMaple } from './store';
import { fakeMaple } from './testing/fakeMaple';

const tab = (id: string, projectKey: string): TabState => ({
  id,
  projectKey,
  kind: 'card',
  cardKey: id.toUpperCase(),
  sessionId: `s-${id}`,
  worktreePath: null,
});

describe('useMaple', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('init selects the first project and loads tabs', async () => {
    // given
    fakeMaple({ tabs: { list: () => Promise.resolve([tab('bear-1', 'BEAR')]) } });
    // when
    await useMaple.getState().init();
    // then
    const state = useMaple.getState();
    expect(state.projectKey).toBe('BEAR');
    expect(state.tabs).toEqual([tab('bear-1', 'BEAR')]);
    expect(state.activeTabId).toBeNull();
  });

  test('switching projects restores the last active tab', async () => {
    // given
    fakeMaple({ tabs: { list: () => Promise.resolve([tab('bear-1', 'BEAR'), tab('dig-1', 'DIG')]) } });
    await useMaple.getState().init();
    useMaple.getState().selectProject('DIG');
    useMaple.getState().activate('dig-1');
    // when
    useMaple.getState().selectProject('BEAR');
    const onBear = useMaple.getState().activeTabId;
    useMaple.getState().selectProject('DIG');
    // then
    expect(onBear).toBeNull();
    expect(useMaple.getState().activeTabId).toBe('dig-1');
  });

  test('activate tells the main process', async () => {
    // given
    const setActive = vi.fn();
    fakeMaple({ tabs: { setActive, list: () => Promise.resolve([tab('bear-1', 'BEAR')]) } });
    await useMaple.getState().init();
    // when
    useMaple.getState().activate('bear-1');
    // then
    expect(setActive).toHaveBeenCalledWith('bear-1');
  });
});
