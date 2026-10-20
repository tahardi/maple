import { APP_CHANNELS, type AppApi } from './api/app';
import { CONFIG_CHANNELS, type ConfigApi } from './api/config';
import { JIRA_CHANNELS, type JiraApi } from './api/jira';
import { PR_CHANNELS, type PrApi } from './api/pr';
import { PREFLIGHT_CHANNELS, type PreflightApi } from './api/preflight';
import { REPO_CHANNELS, type RepoApi } from './api/repo';
import { SESSION_CHANNELS, type SessionApi } from './api/session';
import { TABS_CHANNELS, type TabsApi } from './api/tabs';
import { VAULT_CHANNELS, type VaultApi } from './api/vault';

export const IPC_AREAS = ['config', 'preflight', 'jira', 'tabs', 'session', 'repo', 'vault', 'pr', 'app'] as const;
export type IpcArea = (typeof IPC_AREAS)[number];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- CLAUDE.md allows MapleApi as the one interface
export interface MapleApi {
  config: ConfigApi;
  preflight: PreflightApi;
  jira: JiraApi;
  tabs: TabsApi;
  session: SessionApi;
  repo: RepoApi;
  vault: VaultApi;
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
  repo: REPO_CHANNELS,
  vault: VAULT_CHANNELS,
  pr: PR_CHANNELS,
  app: APP_CHANNELS,
} as const satisfies { [A in IpcArea]: { [M in keyof MapleApi[A]]: ChannelKind } };
