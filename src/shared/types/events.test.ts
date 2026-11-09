import { describe, expect, test } from 'vitest';
import { eventSchemas } from './events';

const transcript = { session: 's1', offset: 120 };

describe('eventSchemas', () => {
  const cases: { type: keyof typeof eventSchemas; name: string; data: unknown; want: unknown }[] = [
    {
      type: 'session.spawn',
      name: 'a spawn',
      data: { prompted: true, resumed: false },
      want: { prompted: true, resumed: false },
    },
    { type: 'session.exit', name: 'an exit code', data: { exitCode: 1 }, want: { exitCode: 1 } },
    { type: 'session.interrupt', name: 'empty data', data: {}, want: {} },
    { type: 'session.resumeFailed', name: 'an exit code', data: { exitCode: 1 }, want: { exitCode: 1 } },
    { type: 'session.resumeFailed', name: 'a null exit code', data: { exitCode: null }, want: { exitCode: null } },
    { type: 'prompt.submitted', name: 'prompt text and drops it', data: { text: 'hi' }, want: {} },
    { type: 'permission.prompt', name: 'empty data', data: {}, want: {} },
    {
      type: 'session.stop',
      name: 'a transcript, head, and tasks',
      data: { transcript, head: 'abc', backgroundTasks: ['shell'] },
      want: { transcript, head: 'abc', backgroundTasks: ['shell'] },
    },
    {
      type: 'session.stop',
      name: 'a null transcript and head',
      data: { transcript: null, head: null, backgroundTasks: [] },
      want: { transcript: null, head: null, backgroundTasks: [] },
    },
    {
      type: 'session.start',
      name: 'a source',
      data: { source: 'clear', transcript: null },
      want: { source: 'clear', transcript: null },
    },
    {
      type: 'session.start',
      name: 'a null source',
      data: { source: null, transcript: null },
      want: { source: null, transcript: null },
    },
    {
      type: 'ui.action',
      name: 'an action and length',
      data: { channel: 'session:sendPrompt', action: 'Fix PR', length: 12 },
      want: { channel: 'session:sendPrompt', action: 'Fix PR', length: 12 },
    },
    {
      type: 'ui.action',
      name: 'a null action and length',
      data: { channel: 'tabs:close', action: null, length: null },
      want: { channel: 'tabs:close', action: null, length: null },
    },
  ];

  test.each(cases)('$type accepts $name', ({ type, data, want }) => {
    // given
    const schema = eventSchemas[type];
    // when
    const parsed = schema.parse(data);
    // then
    expect(parsed).toEqual(want);
  });

  test.each([
    { type: 'session.exit' as const, name: 'a null exit code', data: { exitCode: null } },
    { type: 'session.spawn' as const, name: 'a missing field', data: { prompted: true } },
    { type: 'ui.action' as const, name: 'a negative length', data: { channel: 'x', action: null, length: -1 } },
  ])('$type rejects $name', ({ type, data }) => {
    // given
    const schema = eventSchemas[type];
    // when
    const parsed = schema.safeParse(data);
    // then
    expect(parsed.success).toBe(false);
  });

  test('session.stop rejects an offset that is not a number', () => {
    // given
    const data = { transcript: { session: 's1', offset: '120' }, head: null, backgroundTasks: [] };
    // when
    const parsed = eventSchemas['session.stop'].safeParse(data);
    // then
    expect(parsed.success).toBe(false);
  });
});
