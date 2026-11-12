import { describe, expect, test } from 'vitest';
import { scrubSecrets } from './scrubSecrets';

const pair = Buffer.from('me@x.com:tok-3f9a1c77e2').toString('base64');

describe('scrubSecrets', () => {
  test.each([
    {
      name: 'replaces every place a given secret appears',
      text: 'a tok-3f9a1c77e2 b tok-3f9a1c77e2',
      secrets: ['tok-3f9a1c77e2'],
      want: 'a [redacted] b [redacted]',
    },
    {
      name: 'replaces the base64 of email:token when both are given',
      text: `header ${pair}`,
      secrets: ['tok-3f9a1c77e2', 'me@x.com'],
      want: 'header [redacted]',
    },
    {
      name: 'replaces token-shaped strings that were not passed in',
      text: 'ghp_abc123 gho_def456 github_pat_11AB_cd sk-ant-api03-xy_z',
      secrets: [],
      want: '[redacted] [redacted] [redacted] [redacted]',
    },
    {
      name: 'replaces the credential after Bearer',
      text: 'Authorization: Bearer abc.def-123',
      secrets: [],
      want: 'Authorization: Bearer [redacted]',
    },
    {
      name: 'replaces the credential after Basic',
      text: 'Authorization: Basic bWU6dG9r==',
      secrets: [],
      want: 'Authorization: Basic [redacted]',
    },
    {
      name: 'ignores an empty secret',
      text: 'nothing secret here',
      secrets: [''],
      want: 'nothing secret here',
    },
  ])('$name', ({ text, secrets, want }) => {
    // when
    const got = scrubSecrets(text, secrets);
    // then
    expect(got).toBe(want);
  });
});
