export type JiraStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';
export type ProjectConfig = { name: string; jiraKey: string; jiraBoardId: number; plannerDir: string };
export type ActionConfig = { label: string; prompt: string };
export type MapleConfig = {
  worktreesDir: string;
  notifications: boolean;
  projects: ProjectConfig[];
  actions: ActionConfig[];
};
export type Blocker = { key: string; status: JiraStatus };
export type Card = {
  key: string;
  summary: string;
  status: JiraStatus;
  points: number | null;
  labels: string[];
  blockedBy: Blocker[];
  descriptionMd: string;
  url: string;
};
export type Sprint = { name: string; startDate: string; endDate: string; cards: Card[] };
export type Fetched<T> = { data: T | null; error: string | null; fetchedAt: string | null };
export type TabKind = 'planner' | 'card';
export type TabState = {
  id: string;
  projectKey: string;
  kind: TabKind;
  cardKey: string | null;
  sessionId: string;
  worktreePath: string | null;
};
export type Dot = 'working' | 'waiting' | 'ready' | 'idle';
export type TabStatus = { tabId: string; dot: Dot; sessionAlive: boolean; exitCode: number | null };
export type HookEvent = {
  tabId: string;
  event: 'Stop' | 'Notification' | 'UserPromptSubmit';
  notificationType: string | null;
};
export type ChecksSummary = { passed: number; failed: number; pending: number; total: number };
export type PrInfo = {
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  deviations: string | null;
  needsTaylor: string | null;
  cardImpacts: string | null;
  checks: ChecksSummary;
};
export type FileStatus = 'A' | 'M' | 'D' | 'R';
export type FileChange = { path: string; status: FileStatus; oldPath: string | null };
export type ChangeSet = { base: string; files: FileChange[]; added: number; removed: number };
export type FilePair =
  | { kind: 'text'; path: string; current: string | null; base: string | null }
  | { kind: 'binary'; path: string }
  | { kind: 'tooLarge'; path: string; bytes: number };
export type LineMark =
  | { kind: 'add'; line: number }
  | { kind: 'chg'; line: number; oldText: string | null }
  | { kind: 'del'; afterLine: number; oldText: string };
export type PreflightProblem = { tool: 'claude' | 'gh' | 'git' | 'gh-auth' | 'jira-env'; message: string };
export type CloseResult = { closed: boolean; needsConfirm: boolean };
export type Unsubscribe = () => void;
