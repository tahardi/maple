import type { MapleApi } from '@shared/api/mapleApi';
import type { Fetched } from '@shared/types/app/fetched';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { useMaple } from './store';
import { FAKE_CONFIG, fakeMaple } from './testing/fakeMaple';

const tab = (id: string, projectKey: string): TabState => ({
  id,
  projectKey,
  kind: 'card',
  cardKey: id.toUpperCase(),
  sessionId: `s-${id}`,
  worktreePath: null,
  worktreePaths: [],
});

const status = (tabId: string, dot: TabStatus['dot']): TabStatus => ({
  tabId,
  dot,
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
  sync: null,
});

const MPL_CONFIG: Fetched<MapleConfig> = {
  ...FAKE_CONFIG,
  data: FAKE_CONFIG.data && {
    ...FAKE_CONFIG.data,
    projects: [
      ...FAKE_CONFIG.data.projects.slice(0, 1),
      {
        name: 'Maple',
        jiraKey: 'MPL',
        jiraBoardId: 3,
        plannerDir: '/tmp/planner/mpl',
        repo: 'tahardi/maple',
        otherRepos: [],
      },
    ],
  },
};

function setup(
  tabs: TabState[] = [tab('bear-1', 'BEAR'), tab('dig-1', 'DIG')],
  app: Partial<MapleApi['app']> = {},
  config: Fetched<MapleConfig> = FAKE_CONFIG,
) {
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
      get: () => Promise.resolve(config),
      onChanged: (cb) => {
        events.configChanged = cb;
        return unsubscribe;
      },
    },
    app,
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

  test.each([
    {
      name: 'init selects the saved project when it is in the config',
      saved: () => Promise.resolve('MPL'),
      want: 'MPL',
    },
    {
      name: 'init falls back to the first project when the saved one is gone',
      saved: () => Promise.resolve('OLD'),
      want: 'BEAR',
    },
    {
      name: 'init falls back to the first project when reading the saved one fails',
      saved: () => Promise.reject(new Error('reading state: boom')),
      want: 'BEAR',
    },
  ])('$name', async ({ saved, want }) => {
    // given
    setup(undefined, { lastProject: saved }, MPL_CONFIG);
    // when
    await useMaple.getState().init();
    // then
    expect(useMaple.getState().projectKey).toBe(want);
  });

  test('selecting a project saves it', async () => {
    // given
    const setLastProject = vi.fn(() => Promise.resolve());
    setup(undefined, { setLastProject }, MPL_CONFIG);
    await useMaple.getState().init();
    // when
    useMaple.getState().selectProject('MPL');
    // then
    expect(setLastProject).toHaveBeenCalledWith('MPL');
  });

  test('init does not save the project it falls back to', async () => {
    // given
    const setLastProject = vi.fn(() => Promise.resolve());
    setup(undefined, { lastProject: () => Promise.resolve('OLD'), setLastProject }, MPL_CONFIG);
    // when
    await useMaple.getState().init();
    // then
    expect(setLastProject).not.toHaveBeenCalled();
  });

  test('init leaves the project empty when the config fails even with a saved project', async () => {
    // given
    setup(undefined, { lastProject: () => Promise.resolve('MPL') }, { ...MPL_CONFIG, data: null, error: 'boom' });
    // when
    await useMaple.getState().init();
    // then
    expect(useMaple.getState().projectKey).toBeNull();
  });

  test('selecting a project ignores a failed save', async () => {
    // given
    const failed = Promise.reject(new Error('saving state: boom'));
    const caught = vi.spyOn(failed, 'catch');
    setup(undefined, { setLastProject: () => failed }, MPL_CONFIG);
    await useMaple.getState().init();
    // when
    useMaple.getState().selectProject('MPL');
    // then
    expect(caught).toHaveBeenCalled();
    expect(useMaple.getState().projectKey).toBe('MPL');
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

  test('showLesson activates the tab with the note selected', async () => {
    // given
    const { setActive } = setup();
    await useMaple.getState().init();
    // when
    useMaple.getState().showLesson('bear-1', 'Learning/Security/xss.md');
    // then
    expect(useMaple.getState().activeTabId).toBe('bear-1');
    expect(useMaple.getState().lessonNote).toBe('Learning/Security/xss.md');
    expect(setActive).toHaveBeenCalledWith('bear-1');
  });

  test('selectLesson changes the note without activating a tab', async () => {
    // given
    const { setActive } = setup();
    await useMaple.getState().init();
    // when
    useMaple.getState().selectLesson('Learning/Security/xss.md');
    // then
    expect(useMaple.getState().lessonNote).toBe('Learning/Security/xss.md');
    expect(setActive).not.toHaveBeenCalled();
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

  test('init loads the saved seen map', async () => {
    // given
    setup(undefined, { seen: () => Promise.resolve({ 'dig-1': 'waiting' }) });
    // when
    await useMaple.getState().init();
    // then
    expect(useMaple.getState().seen).toEqual({ 'dig-1': 'waiting' });
  });

  test.each([
    {
      name: 'activating a card tab marks it seen',
      projectKey: 'BEAR',
      tabId: 'bear-1',
      want: { 'bear-1': 'working' },
    },
    {
      name: 'showing Home marks the project planner seen',
      projectKey: 'DIG',
      tabId: null,
      want: { 'dig-p': 'waiting' },
    },
  ])('$name', async ({ projectKey, tabId, want }) => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    setup([tab('bear-1', 'BEAR'), tab('dig-1', 'DIG'), { ...tab('dig-p', 'DIG'), kind: 'planner', cardKey: null }], {
      setSeen,
    });
    await useMaple.getState().init();
    useMaple.setState({
      projectKey,
      statuses: { ...useMaple.getState().statuses, 'dig-p': status('dig-p', 'waiting') },
    });
    // when
    useMaple.getState().activate(tabId);
    // then
    expect(useMaple.getState().seen).toEqual(want);
    expect(setSeen).toHaveBeenCalledWith(want);
  });

  test('markSeen records each tab at its current dot and saves it', async () => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    setup(undefined, { setSeen });
    await useMaple.getState().init();
    useMaple.setState({ statuses: { 'bear-1': status('bear-1', 'ready'), 'dig-1': status('dig-1', 'waiting') } });
    // when
    useMaple.getState().markSeen(['bear-1', 'dig-1', 'no-status']);
    // then
    const want = { 'bear-1': 'ready', 'dig-1': 'waiting' };
    expect(useMaple.getState().seen).toEqual(want);
    expect(setSeen).toHaveBeenCalledWith(want);
  });

  test('tabs:status marks a dot change on the tab in view as seen', async () => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().activate('bear-1');
    // when
    events.status(status('bear-1', 'ready'));
    events.status(status('dig-1', 'ready'));
    // then
    expect(useMaple.getState().seen).toEqual({ 'bear-1': 'ready' });
  });

  test('tabs:status working clears the seen dot of a tab out of view', async () => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    const { events } = setup(undefined, { setSeen, seen: () => Promise.resolve({ 'dig-1': 'waiting' }) });
    await useMaple.getState().init();
    useMaple.setState({ statuses: { 'dig-1': status('dig-1', 'waiting') } });
    // when
    events.status(status('dig-1', 'working'));
    // then
    expect(useMaple.getState().seen).toEqual({});
    expect(setSeen).toHaveBeenCalledWith({});
  });

  test.each([
    { from: 'idle', to: 'waiting' },
    { from: 'waiting', to: 'ready' },
  ] as const)('tabs:status from $from to $to keeps the seen dot of a tab out of view', async ({ from, to }) => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    const { events } = setup(undefined, { setSeen, seen: () => Promise.resolve({ 'dig-1': 'waiting' }) });
    await useMaple.getState().init();
    useMaple.setState({ statuses: { 'dig-1': status('dig-1', from) } });
    // when
    events.status(status('dig-1', to));
    // then
    expect(useMaple.getState().seen).toEqual({ 'dig-1': 'waiting' });
    expect(setSeen).not.toHaveBeenCalled();
  });

  test('init keeps status events that arrive while it loads', async () => {
    // given
    vi.useFakeTimers();
    const loaded = new Date('2026-10-19T10:00:00Z').getTime();
    vi.setSystemTime(loaded);
    let finishSeen: (seen: Record<string, TabStatus['dot']>) => void = () => undefined;
    const seen = new Promise<Record<string, TabStatus['dot']>>((resolve) => {
      finishSeen = resolve;
    });
    const { events } = setup(undefined, { seen: () => seen });
    const loading = useMaple.getState().init();
    events.status(status('bear-1', 'waiting'));
    vi.setSystemTime(loaded + 60_000);
    // when
    finishSeen({});
    await loading;
    // then
    vi.useRealTimers();
    expect(useMaple.getState().statuses['bear-1'].dot).toBe('waiting');
    expect(useMaple.getState().since['bear-1']).toBe(loaded);
  });

  test.each([
    { name: 'in the first status list', tabId: 'bear-1', event: null },
    { name: 'from an event while it loads', tabId: 'dig-1', event: status('dig-1', 'working') },
  ])('init drops the seen dot of a tab working $name', async ({ tabId, event }) => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    let finishSeen: (seen: Record<string, TabStatus['dot']>) => void = () => undefined;
    const seen = new Promise<Record<string, TabStatus['dot']>>((resolve) => {
      finishSeen = resolve;
    });
    const { events } = setup(undefined, { setSeen, seen: () => seen });
    const loading = useMaple.getState().init();
    if (event !== null) {
      events.status(event);
    }
    // when
    finishSeen({ [tabId]: 'waiting' });
    await loading;
    // then
    expect(useMaple.getState().seen).toEqual({});
    expect(setSeen).toHaveBeenCalledWith({});
  });

  test('init starts with no seen dots when reading them fails', async () => {
    // given
    setup(undefined, { seen: () => Promise.reject(new Error('reading state: boom')) });
    // when
    await useMaple.getState().init();
    // then
    expect(useMaple.getState().seen).toEqual({});
    expect(useMaple.getState().projectKey).toBe('BEAR');
  });

  test('markSeen saves nothing for a tab already seen at its dot', async () => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    setup(undefined, { setSeen });
    await useMaple.getState().init();
    useMaple.setState({ statuses: { 'bear-1': status('bear-1', 'waiting') }, seen: { 'bear-1': 'waiting' } });
    // when
    useMaple.getState().markSeen(['bear-1']);
    // then
    expect(setSeen).not.toHaveBeenCalled();
  });

  test('opening an idle tab keeps its saved dot', async () => {
    // given
    const { events } = setup(undefined, { seen: () => Promise.resolve({ 'dig-1': 'waiting' }) });
    await useMaple.getState().init();
    useMaple.setState({ statuses: { 'dig-1': status('dig-1', 'idle') } });
    // when
    useMaple.getState().activate('dig-1');
    useMaple.getState().activate(null);
    events.status(status('dig-1', 'waiting'));
    // then
    expect(useMaple.getState().seen).toEqual({ 'dig-1': 'waiting' });
  });

  test('tabs:status idle on the tab in view keeps its saved dot', async () => {
    // given
    const { events } = setup(undefined, { seen: () => Promise.resolve({ 'dig-1': 'waiting' }) });
    await useMaple.getState().init();
    useMaple.setState({ statuses: { 'dig-1': status('dig-1', 'waiting') } });
    useMaple.getState().activate('dig-1');
    // when
    events.status(status('dig-1', 'idle'));
    // then
    expect(useMaple.getState().seen).toEqual({ 'dig-1': 'waiting' });
  });

  test('tabs:status working saves nothing for a tab out of view with no seen dot', async () => {
    // given
    const setSeen = vi.fn(() => Promise.resolve());
    const { events } = setup(undefined, { setSeen });
    await useMaple.getState().init();
    // when
    events.status(status('dig-1', 'working'));
    // then
    expect(setSeen).not.toHaveBeenCalled();
  });

  test('a tab left while working stays at its working seen dot when it stops', async () => {
    // given
    const { events } = setup();
    await useMaple.getState().init();
    useMaple.getState().activate('dig-1');
    events.status(status('dig-1', 'working'));
    useMaple.getState().activate(null);
    // when
    events.status(status('dig-1', 'waiting'));
    // then
    expect(useMaple.getState().seen).toEqual({ 'dig-1': 'working' });
  });

  test('selectProject with a tab opens it and leaves the last tab of the project unseen', async () => {
    // given
    setup([tab('dig-1', 'DIG'), tab('dig-2', 'DIG')]);
    await useMaple.getState().init();
    useMaple.setState({
      statuses: { 'dig-1': status('dig-1', 'waiting'), 'dig-2': status('dig-2', 'ready') },
      lastActive: { DIG: 'dig-1' },
    });
    // when
    useMaple.getState().selectProject('DIG', 'dig-2');
    // then
    expect(useMaple.getState().activeTabId).toBe('dig-2');
    expect(useMaple.getState().seen).toEqual({ 'dig-2': 'ready' });
  });

  test('tabs:activate leaves the last tab of the other project unseen', async () => {
    // given
    const { events } = setup([tab('bear-1', 'BEAR'), tab('dig-1', 'DIG'), tab('dig-2', 'DIG')]);
    await useMaple.getState().init();
    useMaple.setState({
      statuses: { 'dig-1': status('dig-1', 'waiting'), 'dig-2': status('dig-2', 'ready') },
      lastActive: { DIG: 'dig-1' },
    });
    // when
    events.activate('dig-2');
    // then
    expect(useMaple.getState().seen).toEqual({ 'dig-2': 'ready' });
  });

  test('tabs:activate switches to the tab project and activates the tab', async () => {
    // given
    const setLastProject = vi.fn(() => Promise.resolve());
    const { events, setActive } = setup(undefined, { setLastProject });
    await useMaple.getState().init();
    // when
    events.activate('dig-1');
    // then
    expect(useMaple.getState().projectKey).toBe('DIG');
    expect(setLastProject).toHaveBeenCalledWith('DIG');
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

  test('setDraft stores and clears a draft per tab and path', () => {
    // given
    const other = { text: 'b\n', disk: 'a\n' };
    const draft = { text: 'two\n', disk: 'one\n' };
    useMaple.getState().setDraft('t2', 'a.ts', other);
    // when
    useMaple.getState().setDraft('t1', 'a.ts', draft);
    // then
    expect(useMaple.getState().drafts.t1['a.ts']).toEqual(draft);
    // when
    useMaple.getState().setDraft('t1', 'a.ts', null);
    // then
    expect(useMaple.getState().drafts.t1).not.toHaveProperty('a.ts');
    expect(useMaple.getState().drafts.t2).toEqual({ 'a.ts': other });
  });
});
