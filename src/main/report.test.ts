import { describe, expect, test } from 'vitest';
import { logTail, reportDescription } from './report';

const TOKEN = 'tok-3f9a1c77e2';
const EMAIL = 'me@example.com';
const BASIC = Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');

describe('logTail', () => {
  test.each([
    { name: 'keeps only the last N lines', text: 'a\nb\nc\nd\n', lines: 2, secrets: [], want: 'c\nd' },
    { name: 'returns a file shorter than N whole', text: 'a\nb\n', lines: 5, secrets: [], want: 'a\nb' },
    {
      name: 'replaces every place a given secret appears',
      text: `run --token ${TOKEN}\nerror ${TOKEN} and ${TOKEN}\n`,
      lines: 10,
      secrets: [TOKEN],
      want: 'run --token [redacted]\nerror [redacted] and [redacted]',
    },
    {
      name: 'replaces the base64 of email:token',
      text: `Authorization: Basic ${BASIC}\n`,
      lines: 10,
      secrets: [TOKEN, EMAIL],
      want: 'Authorization: Basic [redacted]',
    },
    {
      name: 'replaces token-shaped strings that were not passed in',
      text: 'a ghp_abc123XYZ\nb gho_Q9z\nc github_pat_11AB_cd9\nd key=sk-ant-api03-x_Y-z\n',
      lines: 10,
      secrets: [],
      want: 'a [redacted]\nb [redacted]\nc [redacted]\nd key=[redacted]',
    },
    { name: 'ignores an empty secret', text: 'a b\n', lines: 10, secrets: [''], want: 'a b' },
    {
      name: 'drops the oldest whole lines to stay under the character cap',
      text: 'aaaa\nbbbb\ncccc\n',
      lines: 10,
      secrets: [],
      maxChars: 9,
      want: 'bbbb\ncccc',
    },
    {
      name: 'keeps the newest line cut to the cap when it alone is too long',
      text: 'old\n0123456789\n',
      lines: 10,
      secrets: [],
      maxChars: 4,
      want: '6789',
    },
  ])('$name', ({ text, lines, secrets, maxChars, want }) => {
    // when
    const got = logTail(text, lines, secrets, maxChars);
    // then
    expect(got).toBe(want);
  });
});

describe('reportDescription', () => {
  test('makes one paragraph per blank-line-separated block', () => {
    // when
    const got = reportDescription('First block\nstill first\n\n  \nSecond block', null);
    // then
    expect(got).toEqual({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'First block' },
            { type: 'hardBreak' },
            { type: 'text', text: 'still first' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second block' }] },
      ],
    });
  });

  test('ends with a Recent log heading and one code block when given a log', () => {
    // when
    const got = reportDescription('It broke', 'line 1\nline 2');
    // then
    expect(got.content.slice(1)).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Recent log' }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'line 1\nline 2' }] },
    ]);
  });

  test('adds no heading or code block without a log', () => {
    // when
    const got = reportDescription('It broke', null);
    // then
    expect(got.content.map((node) => node.type)).toEqual(['paragraph']);
  });
});
