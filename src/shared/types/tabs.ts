export type TabKind = 'planner' | 'card';
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
export type Dot = 'working' | 'waiting' | 'ready' | 'idle' | 'merged';
export type TabStatus = {
  tabId: string;
  dot: Dot;
  sessionAlive: boolean;
  exitCode: number | null;
  resumeFailed: boolean;
};
export type HookEvent = {
  tabId: string;
  event: 'Stop' | 'Notification' | 'UserPromptSubmit';
  notificationType: string | null;
};
export type CloseResult = { closed: boolean; needsConfirm: boolean };
