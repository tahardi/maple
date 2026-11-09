export type TabKind = 'planner' | 'card' | 'vault';
export type TabState = {
  id: string;
  projectKey: string;
  kind: TabKind;
  cardKey: string | null;
  sessionId: string;
  worktreePath: string | null;
};
export type SessionCost = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  dollars: number | null;
};
export type SyncState = 'queued' | 'syncing' | null;
export type Dot = 'working' | 'waiting' | 'ready' | 'idle' | 'merged';
export type TabStatus = {
  tabId: string;
  dot: Dot;
  sessionAlive: boolean;
  exitCode: number | null;
  resumeFailed: boolean;
  sync: SyncState;
};
export type HookEvent = {
  tabId: string;
  event: 'Stop' | 'Notification' | 'UserPromptSubmit' | 'SessionStart';
  notificationType: string | null;
  backgroundTasks?: string[];
  crons?: number;
  sessionId?: string | null;
  source?: string | null;
};
export type CloseResult = { closed: boolean; needsConfirm: boolean };
