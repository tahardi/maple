import { describe, expect, test, vi } from 'vitest';
import { createLogger, redact } from './log';

function setup() {
  const write = vi.fn<(level: 'info' | 'warn' | 'error', line: string) => void>();
  return { write, logger: createLogger(write) };
}

describe('createLogger', () => {
  test('writes the scope, message, and fields at info', () => {
    // given
    const { write, logger } = setup();
    // when
    logger.info('session', 'spawned', { tabId: 't1', args: ['--resume', 'abc'] });
    // then
    expect(write).toHaveBeenCalledWith('info', 'session spawned tabId=t1 args=--resume,abc');
  });

  test('quotes a string with a space', () => {
    // given
    const { write, logger } = setup();
    // when
    logger.info('session', 'spawned', { cwd: '/home/x/my dir' });
    // then
    expect(write).toHaveBeenCalledWith('info', 'session spawned cwd="/home/x/my dir"');
  });

  test.each([{ level: 'warn' as const }, { level: 'error' as const }])('writes $level at its level', ({ level }) => {
    // given
    const { write, logger } = setup();
    // when
    logger[level]('jira', 'failed', { operation: 'getCard' });
    // then
    expect(write).toHaveBeenCalledWith(level, 'jira failed operation=getCard');
  });

  test('drops secret fields', () => {
    // given
    const { write, logger } = setup();
    // when
    logger.info('jira', 'request', { token: 'x', tabId: 't' });
    // then
    expect(write).toHaveBeenCalledWith('info', 'jira request tabId=t');
  });

  test.each([
    {
      name: 'numbers, booleans, and null',
      fields: { code: 1, resumed: false, pr: null },
      want: 'code=1 resumed=false pr=null',
    },
    {
      name: 'an array item with a space',
      fields: { args: ['--settings', '/card DIG-1'] },
      want: 'args="--settings,/card DIG-1"',
    },
    { name: 'a nested object', fields: { pr: { state: 'OPEN' } }, want: 'pr={"state":"OPEN"}' },
    { name: 'a multi-line string', fields: { line: 'a\nb' }, want: 'line="a\\nb"' },
  ])('formats $name', ({ fields, want }) => {
    // given
    const { write, logger } = setup();
    // when
    logger.info('hook', 'received', fields);
    // then
    expect(write).toHaveBeenCalledWith('info', `hook received ${want}`);
  });

  test('writes no fields after the message when none are given', () => {
    // given
    const { write, logger } = setup();
    // when
    logger.info('config', 'loaded');
    // then
    expect(write).toHaveBeenCalledWith('info', 'config loaded');
  });
});

describe('redact', () => {
  test.each([
    { name: 'a token', fields: { token: 'x', tabId: 't' }, want: { tabId: 't' } },
    { name: 'a nested authorization', fields: { headers: { Authorization: 'Basic x' } }, want: { headers: {} } },
    { name: 'the environment', fields: { env: { A: '1' } }, want: {} },
  ])('drops $name', ({ fields, want }) => {
    // when
    const got = redact(fields);
    // then
    expect(got).toEqual(want);
  });

  test.each([
    { name: 'password and secret keys', fields: { password: 'p', clientSecret: 's', ok: 1 }, want: { ok: 1 } },
    {
      name: 'a key deep in nested objects',
      fields: { a: { b: { JIRA_TOKEN: 'x', c: 1 } } },
      want: { a: { b: { c: 1 } } },
    },
    {
      name: 'nothing from safe fields',
      fields: { tabId: 't', args: ['a'], pr: null },
      want: { tabId: 't', args: ['a'], pr: null },
    },
  ])('handles $name', ({ fields, want }) => {
    // when
    const got = redact(fields);
    // then
    expect(got).toEqual(want);
  });
});
