import { describe, expect, test } from 'vitest';
import { backgroundWait, unknownTasks } from './backgroundWait';

describe('backgroundWait', () => {
  test.each([
    { name: 'nothing running', tasks: [], crons: 0, want: null },
    { name: 'a subagent', tasks: ['subagent'], crons: 0, want: 'agent' },
    { name: 'a workflow', tasks: ['workflow'], crons: 0, want: 'agent' },
    { name: 'a shell', tasks: ['shell'], crons: 0, want: 'limited' },
    { name: 'a cron', tasks: [], crons: 1, want: 'limited' },
    { name: 'a subagent and a shell', tasks: ['shell', 'subagent'], crons: 1, want: 'agent' },
    { name: 'a monitor', tasks: ['monitor'], crons: 0, want: null },
    { name: 'a teammate', tasks: ['teammate'], crons: 0, want: null },
    { name: 'a cloud session', tasks: ['cloud session'], crons: 0, want: null },
    { name: 'an unknown type', tasks: ['helper'], crons: 0, want: null },
  ])('returns $want for $name', ({ tasks, crons, want }) => {
    // when
    const wait = backgroundWait(tasks, crons);
    // then
    expect(wait).toBe(want);
  });
});

describe('unknownTasks', () => {
  test.each([
    { name: 'no tasks', tasks: [], want: [] },
    {
      name: 'every type Claude Code reports',
      tasks: [
        'subagent',
        'workflow',
        'shell',
        'monitor',
        'MCP task',
        'teammate',
        'dream',
        'auto-mode scan',
        'memory import',
        'memory save',
        'cloud session',
        'code',
      ],
      want: [],
    },
    { name: 'a renamed type', tasks: ['subagent', 'helper'], want: ['helper'] },
    { name: 'a type name on Object.prototype', tasks: ['constructor'], want: ['constructor'] },
  ])('returns $want for $name', ({ tasks, want }) => {
    // when
    const unknown = unknownTasks(tasks);
    // then
    expect(unknown).toEqual(want);
  });
});
