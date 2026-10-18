import type {
  ChangeSet,
  CloseResult,
  Fetched,
  FilePair,
  MapleConfig,
  PreflightProblem,
  PrInfo,
  Sprint,
  TabState,
  TabStatus,
  Unsubscribe,
} from './types';

export const IPC_AREAS = ['config', 'preflight', 'jira', 'tabs', 'session', 'repo', 'pr', 'app'] as const;
export type IpcArea = (typeof IPC_AREAS)[number];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- CLAUDE.md allows MapleApi as the one interface
export interface MapleApi {
  config: { get(): Promise<Fetched<MapleConfig>>; reload(): Promise<Fetched<MapleConfig>> };
  preflight: { run(): Promise<PreflightProblem[]> };
  jira: { sprint(projectKey: string): Promise<Fetched<Sprint>> };
  tabs: {
    list(): Promise<TabState[]>;
    startCard(projectKey: string, cardKey: string): Promise<TabState>;
    openCard(projectKey: string, cardKey: string): Promise<TabState>;
    openPlanner(projectKey: string): Promise<TabState>;
    close(tabId: string, force: boolean): Promise<CloseResult>;
    resume(tabId: string): Promise<void>;
    startFresh(tabId: string): Promise<void>;
    setActive(tabId: string): void;
    statuses(): Promise<TabStatus[]>;
    onStatus(cb: (s: TabStatus) => void): Unsubscribe;
    onChanged(cb: (tabs: TabState[]) => void): Unsubscribe;
    onActivate(cb: (tabId: string) => void): Unsubscribe;
  };
  session: {
    write(tabId: string, data: string): void;
    resize(tabId: string, cols: number, rows: number): void;
    sendPrompt(tabId: string, text: string): void;
    backlog(tabId: string): Promise<string>;
    onData(tabId: string, cb: (data: string) => void): Unsubscribe;
    onBatch(projectKey: string, cb: (keys: string[]) => void): Unsubscribe;
  };
  repo: {
    changes(tabId: string): Promise<ChangeSet | null>;
    listFiles(tabId: string): Promise<string[]>;
    readFile(tabId: string, path: string): Promise<FilePair>;
    onChanged(tabId: string, cb: () => void): Unsubscribe;
  };
  pr: { get(tabId: string): Promise<Fetched<PrInfo>>; approve(tabId: string): Promise<void> };
  app: {
    setNotifications(on: boolean): Promise<void>;
    onQuitRequested(cb: (workingCardKeys: string[]) => void): Unsubscribe;
    confirmQuit(): void;
  };
}

export type ChannelKind = 'invoke' | 'send' | 'event';

export const IPC_CHANNELS = {
  config: { get: 'invoke', reload: 'invoke' },
  preflight: { run: 'invoke' },
  jira: { sprint: 'invoke' },
  tabs: {
    list: 'invoke',
    startCard: 'invoke',
    openCard: 'invoke',
    openPlanner: 'invoke',
    close: 'invoke',
    resume: 'invoke',
    startFresh: 'invoke',
    setActive: 'send',
    statuses: 'invoke',
    onStatus: 'event',
    onChanged: 'event',
    onActivate: 'event',
  },
  session: {
    write: 'send',
    resize: 'send',
    sendPrompt: 'send',
    backlog: 'invoke',
    onData: 'event',
    onBatch: 'event',
  },
  repo: { changes: 'invoke', listFiles: 'invoke', readFile: 'invoke', onChanged: 'event' },
  pr: { get: 'invoke', approve: 'invoke' },
  app: { setNotifications: 'invoke', onQuitRequested: 'event', confirmQuit: 'send' },
} as const satisfies { [A in IpcArea]: { [M in keyof MapleApi[A]]: ChannelKind } };
