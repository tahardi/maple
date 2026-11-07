const AGENT_TASKS = new Set(['subagent', 'workflow']);
const LIMITED_TASKS = new Set(['shell']);
const IGNORED_TASKS = new Set([
  'monitor',
  'MCP task',
  'teammate',
  'dream',
  'auto-mode scan',
  'memory import',
  'memory save',
  'cloud session',
  'code',
]);

export type BackgroundWait = 'agent' | 'limited' | null;

export function backgroundWait(tasks: readonly string[], crons: number): BackgroundWait {
  if (tasks.some((task) => AGENT_TASKS.has(task))) {
    return 'agent';
  }
  return crons > 0 || tasks.some((task) => LIMITED_TASKS.has(task)) ? 'limited' : null;
}

export function unknownTasks(tasks: readonly string[]): string[] {
  return tasks.filter((task) => !AGENT_TASKS.has(task) && !LIMITED_TASKS.has(task) && !IGNORED_TASKS.has(task));
}
