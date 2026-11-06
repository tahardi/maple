import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { Runner as CommandRunner } from '@main/app/preflight';
import { ghLogin, openFindings } from './securityFindings';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/gh', name), 'utf8');

type Comment = { id: number; html_url: string; user: { login: string }; created_at: string; body: string };

const comments = (JSON.parse(fixture('pr-issue-comments.json')) as Comment[][]).flat();

function runnerFor(pages: Comment[][]) {
  return vi.fn<CommandRunner>(() => Promise.resolve({ code: 0, stdout: JSON.stringify(pages), stderr: '' }));
}

function comment(id: number, login: string, body: string, createdAt: string): Comment {
  return {
    id,
    html_url: `https://github.com/tahardi/maple/pull/33#issuecomment-${String(id)}`,
    user: { login },
    created_at: createdAt,
    body,
  };
}

const f1 = {
  id: 'F1',
  severity: 'high',
  summary: 'Token written to the log file',
  url: 'https://github.com/tahardi/maple/pull/33#issuecomment-2002',
};

describe('openFindings', () => {
  test('lists findings Taylor has not accepted', async () => {
    // given
    const run = vi.fn<CommandRunner>(() =>
      Promise.resolve({ code: 0, stdout: fixture('pr-issue-comments.json'), stderr: '' }),
    );
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings).toEqual([f1]);
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/issues/33/comments'],
      '',
    );
  });

  test('an acceptance from anyone but Taylor does not count', async () => {
    // given
    const run = runnerFor([comments.filter((c) => c.id !== 2003)]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings.map((f) => f.id)).toEqual(['F1', 'F2']);
  });

  test('an acceptance before the finding does not count', async () => {
    // given
    const early = comment(2000, 'tahardi', 'xena-accept F1', '2026-10-25T09:00:00Z');
    const run = runnerFor([[comments[1]], [early]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings).toEqual([f1]);
  });

  test('sorts findings high, medium, low', async () => {
    // given
    const low = comment(
      3001,
      'xena-dev[bot]',
      '<!-- xena-security-finding severity=low id=L1 -->\nLow',
      '2026-10-25T09:00:00Z',
    );
    const run = runnerFor([[low, comments[0], comments[1]]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings.map((f) => f.severity)).toEqual(['high', 'medium', 'low']);
  });

  test.each([
    { name: 'not at the start', body: 'See:\n<!-- xena-security-finding severity=high id=X1 -->\nBad' },
    { name: 'with an unknown severity', body: '<!-- xena-security-finding severity=critical id=X1 -->\nBad' },
    { name: 'with a space in the id', body: '<!-- xena-security-finding severity=high id=X 1 -->\nBad' },
  ])('ignores marker $name', async ({ body }) => {
    // given
    const run = runnerFor([[comment(4001, 'xena-dev[bot]', body, '2026-10-25T09:00:00Z')]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings).toEqual([]);
  });

  test.each([
    { name: 'posted at the same time', body: 'xena-accept F1', at: '2026-10-25T10:01:00Z', open: true },
    { name: 'not alone on its line', body: 'ok, xena-accept F1', at: '2026-10-25T12:00:00Z', open: true },
    { name: 'ending in CRLF', body: 'fine\r\nxena-accept F1\r\n', at: '2026-10-25T12:00:00Z', open: false },
  ])('an acceptance $name leaves the finding open: $open', async ({ body, at, open }) => {
    // given
    const run = runnerFor([[comments[1], comment(6001, 'tahardi', body, at)]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings.length > 0).toBe(open);
  });

  test('skips comments from deleted users and with no body', async () => {
    // given
    const ghost = { ...comment(7001, 'x', 'xena-accept F1', '2026-10-25T12:00:00Z'), user: null, body: null };
    const run = runnerFor([[comments[1], ghost as unknown as Comment]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings).toEqual([f1]);
  });

  test('gives an empty summary for a marker with no text after it', async () => {
    // given
    const body = '<!-- xena-security-finding severity=low id=L1 -->\n\n';
    const run = runnerFor([[comment(8001, 'xena-dev[bot]', body, '2026-10-25T09:00:00Z')]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings[0]?.summary).toBe('');
  });

  test('truncates the summary to 200 characters', async () => {
    // given
    const body = `<!-- xena-security-finding severity=low id=L1 -->\n${'x'.repeat(300)}`;
    const run = runnerFor([[comment(5001, 'xena-dev[bot]', body, '2026-10-25T09:00:00Z')]]);
    // when
    const findings = await openFindings(run, 33, 'tahardi');
    // then
    expect(findings[0]?.summary).toBe('x'.repeat(200));
  });

  test('reports a failed gh call', async () => {
    // given
    const run = vi.fn<CommandRunner>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 502' }));
    // when
    const result = openFindings(run, 33, 'tahardi');
    // then
    await expect(result).rejects.toThrow('listing findings: HTTP 502');
  });
});

describe('ghLogin', () => {
  test('returns the desktop gh login', async () => {
    // given
    const run = vi.fn<CommandRunner>(() => Promise.resolve({ code: 0, stdout: 'tahardi\n', stderr: '' }));
    // when
    const login = await ghLogin(run);
    // then
    expect(login).toBe('tahardi');
    expect(run).toHaveBeenCalledWith('gh', ['api', 'user', '--jq', '.login'], '');
  });

  test('reports a failed gh call', async () => {
    // given
    const run = vi.fn<CommandRunner>(() => Promise.resolve({ code: 4, stdout: '', stderr: 'not logged in' }));
    // when
    const result = ghLogin(run);
    // then
    await expect(result).rejects.toThrow('reading gh login: not logged in');
  });
});
