import { APP_CHANNELS, type AppApi } from './app';
import { CONFIG_CHANNELS, type ConfigApi } from './config';
import { JIRA_CHANNELS, type JiraApi } from './jira';
import { LEARNING_CHANNELS, type LearningApi } from './learning';
import { PR_CHANNELS, type PrApi } from './pr';
import { PREFLIGHT_CHANNELS, type PreflightApi } from './preflight';
import { REPO_CHANNELS, type RepoApi } from './repo';
import { SESSION_CHANNELS, type SessionApi } from './session';
import { TABS_CHANNELS, type TabsApi } from './tabs';
import { TERMINAL_CHANNELS, type TerminalApi } from './terminal';
import { VAULT_CHANNELS, type VaultApi } from './vault';

export const IPC_AREAS = [
  'config',
  'preflight',
  'jira',
  'tabs',
  'session',
  'terminal',
  'repo',
  'vault',
  'learning',
  'pr',
  'app',
] as const;
export type IpcArea = (typeof IPC_AREAS)[number];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- CLAUDE.md allows MapleApi as the one interface
export interface MapleApi {
  config: ConfigApi;
  preflight: PreflightApi;
  jira: JiraApi;
  tabs: TabsApi;
  session: SessionApi;
  terminal: TerminalApi;
  repo: RepoApi;
  vault: VaultApi;
  learning: LearningApi;
  pr: PrApi;
  app: AppApi;
}

export type ChannelKind = 'invoke' | 'send' | 'event';

export const IPC_CHANNELS = {
  config: CONFIG_CHANNELS,
  preflight: PREFLIGHT_CHANNELS,
  jira: JIRA_CHANNELS,
  tabs: TABS_CHANNELS,
  session: SESSION_CHANNELS,
  terminal: TERMINAL_CHANNELS,
  repo: REPO_CHANNELS,
  vault: VAULT_CHANNELS,
  learning: LEARNING_CHANNELS,
  pr: PR_CHANNELS,
  app: APP_CHANNELS,
} as const satisfies { [A in IpcArea]: { [M in keyof MapleApi[A]]: ChannelKind } };

export type MethodOf<A extends IpcArea, K extends ChannelKind> = {
  [M in keyof MapleApi[A] & keyof (typeof IPC_CHANNELS)[A]]: (typeof IPC_CHANNELS)[A][M] extends K ? M : never;
}[keyof MapleApi[A] & keyof (typeof IPC_CHANNELS)[A]] &
  string;
