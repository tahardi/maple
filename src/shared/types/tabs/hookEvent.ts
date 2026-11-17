export type HookEvent = {
  tabId: string;
  event: 'Stop' | 'Notification' | 'UserPromptSubmit' | 'SessionStart';
  notificationType: string | null;
  backgroundTasks?: string[];
  crons?: number;
  sessionId?: string | null;
  source?: string | null;
};
