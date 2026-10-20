import type { Fetched, MapleConfig, TabState, TabStatus } from '@shared/types';
import { useMaple } from './store';
import { FAKE_CONFIG, fakeMaple } from './testing/fakeMaple';

const tab = (id: string, projectKey: string): TabState => ({
  id,
  projectKey,
  kind: 'card',
  cardKey: id.toUpperCase(),
  sessionId: `s-${id}`,
  worktreePath: null,
});

const status = (tabId: string, dot: TabStatus['dot']): TabStatus => ({
  tabId,
  dot,
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
});

function setup(tabs: TabState[] = [tab('bear-1', 'BEAR'), tab('dig-1', 'DIG')]) {
  const ignore = () => undefined;
  const events: {
    tabsChanged: (tabs: TabState[]) => void;
    status: (s: TabStatus) => void;
    activate: (tabId: string) => void;
    configChanged: (config: Fetched<MapleConfig>) => void;
  } = { tabsChanged: ignore, status: ignore, activate: ignore, configChanged: ignore };
  const setActive = vi.fn();
  const unsubscribe = vi.fn();
  fakeMaple({
    tabs: {
      list: () => Promise.resolve(tabs),
      statuses: () => Promise.resolve([status('bear-1', 'working')]),
      setActive,
      onChanged: (cb) => {
        events.tabsChanged = cb;
        return unsubscribe;
      },
      onStatus: (cb) => {
        events.status = cb;
        return unsubscribe;
      },
      onActivate: (cb) => {
        events.activate = cb;
        return unsubscribe;
      },
    },
    config: {
      onChanged: (cb) => {
        events.configChanged = cb;
        return unsubscribe;
      },
    },
  });
  return { events, setActive, unsubscribe };
}

describe('useMaple', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('init selects the first project and loads tabs and statuses', async () => {
    // given
    setup([tab('bear-1', 'BEAR')]);
    // when
    await useMaple.getState().init();
    // then
    const state = useMaple.getState();
    expect(state.projectKey).toBe('BEAR');
    expect(state.tabs).toEqual([tab('bear-1', 'BEAR')]);
    expect(state.statuses).toEqual({ 'bear-1': status('bear-1', 'working') });
    expect(state.activeTabId).toBeNull();
  });

  test('switching projects restores the last active tab', async () => {
    // given
    setup();
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

  test('switching back to a project whose last tab closed shows Home', async () => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().selectProject('DIG');
    useMaple.getState().activate('dig-1');
    useMaple.getState().selectProject('BEAR');
    events.tabsChanged([tab('bear-1', 'BEAR')]);
    // when
    useMaple.getState().selectProject('DIG');
    // then
    expect(useMaple.getState().activeTabId).toBeNull();
  });

  test.each([
    { tabId: 'bear-1', calls: [['bear-1']] },
    { tabId: null, calls: [[null]] },
  ])('activate($tabId) tells the main process which tab is active', async ({ tabId, calls }) => {
    // given
    const { setActive } = setup();
    await useMaple.getState().init();
    // when
    useMaple.getState().activate(tabId);
    // then
    expect(useMaple.getState().activeTabId).toBe(tabId);
    expect(setActive.mock.calls).toEqual(calls);
  });

  test('tabs:changed replaces the tabs and returns to Home when the active tab closes', async () => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().activate('bear-1');
    // when
    events.tabsChanged([tab('dig-1', 'DIG')]);
    // then
    expect(useMaple.getState().tabs).toEqual([tab('dig-1', 'DIG')]);
    expect(useMaple.getState().activeTabId).toBeNull();
  });

  test('tabs:changed keeps the active tab when it is still open', async () => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().activate('bear-1');
    // when
    events.tabsChanged([tab('bear-1', 'BEAR'), tab('bear-2', 'BEAR')]);
    // then
    expect(useMaple.getState().activeTabId).toBe('bear-1');
  });

  test('tabs:status updates one tab status', async () => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    // when
    events.status(status('dig-1', 'waiting'));
    // then
    expect(useMaple.getState().statuses).toEqual({
      'bear-1': status('bear-1', 'working'),
      'dig-1': status('dig-1', 'waiting'),
    });
  });

  test('tabs:status records when a tab dot changed', async () => {
    // given
    vi.useFakeTimers();
    const loaded = new Date('2026-10-19T10:00:00Z').getTime();
    vi.setSystemTime(loaded);
    const { events } = setup();
    await useMaple.getState().init();
    const sinceAtInit = useMaple.getState().since;
    // when
    events.status(status('bear-1', 'waiting'));
    const sinceWaiting = useMaple.getState().since['bear-1'];
    vi.setSystemTime(loaded + 60_000);
    events.status(status('bear-1', 'waiting'));
    const sinceRepeated = useMaple.getState().since['bear-1'];
    vi.setSystemTime(loaded + 120_000);
    events.status(status('bear-1', 'ready'));
    // then
    vi.useRealTimers();
    expect(sinceAtInit).toEqual({ 'bear-1': loaded });
    expect(sinceWaiting).toBe(loaded);
    expect(sinceRepeated).toBe(loaded);
    expect(useMaple.getState().since['bear-1']).toBe(loaded + 120_000);
  });

  test.each([
    { name: 'activating a card tab marks it seen', projectKey: 'BEAR', tabId: 'bear-1', want: ['bear-1'] },
    { name: 'showing Home marks the project planner seen', projectKey: 'DIG', tabId: null, want: ['dig-p'] },
  ])('$name', async ({ projectKey, tabId, want }) => {
    // given
    vi.useFakeTimers();
    const now = new Date('2026-10-20T10:00:00Z').getTime();
    vi.setSystemTime(now);
    setup([tab('bear-1', 'BEAR'), tab('dig-1', 'DIG'), { ...tab('dig-p', 'DIG'), kind: 'planner', cardKey: null }]);
    await useMaple.getState().init();
    useMaple.setState({ projectKey });
    // when
    useMaple.getState().activate(tabId);
    // then
    vi.useRealTimers();
    expect(useMaple.getState().seen).toEqual(Object.fromEntries(want.map((id) => [id, now])));
  });

  test('tabs:status marks a dot change on the tab in view as seen', async () => {
    // given
    vi.useFakeTimers();
    const now = new Date('2026-10-20T10:00:00Z').getTime();
    vi.setSystemTime(now);
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().activate('bear-1');
    vi.setSystemTime(now + 60_000);
    // when
    events.status(status('bear-1', 'ready'));
    events.status(status('dig-1', 'ready'));
    // then
    vi.useRealTimers();
    expect(useMaple.getState().seen).toEqual({ 'bear-1': now + 60_000 });
  });

  test('tabs:activate switches to the tab project and activates the tab', async () => {
    // given
    const { events, setActive } = setup();
    await useMaple.getState().init();
    // when
    events.activate('dig-1');
    // then
    expect(useMaple.getState().projectKey).toBe('DIG');
    expect(useMaple.getState().activeTabId).toBe('dig-1');
    expect(setActive).toHaveBeenLastCalledWith('dig-1');
  });

  test.each([
    { name: 'keeps the selected project when it remains', keys: ['BEAR', 'DIG'], want: 'DIG' },
    { name: 'falls back to the first project when the selected one is removed', keys: ['BEAR'], want: 'BEAR' },
    { name: 'clears the project when the config fails', keys: null, want: null },
  ])('config:changed $name', async ({ keys, want }) => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().selectProject('DIG');
    const projects = FAKE_CONFIG.data?.projects.filter((p) => keys?.includes(p.jiraKey)) ?? [];
    const config: Fetched<MapleConfig> =
      keys === null || FAKE_CONFIG.data === null
        ? { data: null, error: 'reading config: bad json', fetchedAt: null }
        : { ...FAKE_CONFIG, data: { ...FAKE_CONFIG.data, projects } };
    // when
    events.configChanged(config);
    // then
    expect(useMaple.getState().config).toEqual(config);
    expect(useMaple.getState().projectKey).toBe(want);
  });

  test('init again drops the earlier subscriptions', async () => {
    // given
    const { unsubscribe } = setup();
    await useMaple.getState().init();
    // when
    await useMaple.getState().init();
    // then
    expect(unsubscribe).toHaveBeenCalledTimes(4);
  });
});
