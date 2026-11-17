import { describe, expect, test } from 'vitest';
import { redact } from './redact';

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
      name: 'a key inside an array of objects',
      fields: { items: [{ token: 'x', id: 1 }, 'a'] },
      want: { items: [{ id: 1 }, 'a'] },
    },
    {
      name: 'a key inside nested arrays',
      fields: { rows: [[{ password: 'p', id: 2 }]] },
      want: { rows: [[{ id: 2 }]] },
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
