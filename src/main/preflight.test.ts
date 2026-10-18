import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { PreflightProblem } from '@shared/types';
import { defaultRunner, runPreflight, type Runner } from './preflight';

const dir = mkdtempSync(join(tmpdir(), 'maple-preflight-'));
const presentEnv = join(dir, 'env');
const missingEnv = join(dir, 'missing');
writeFileSync(presentEnv, '');

function fakeRunner(codes: Record<string, number>): Runner {
  return (cmd, args) => Promise.resolve({ code: codes[`${cmd} ${args.join(' ')}`] ?? 0, stdout: '', stderr: '' });
}

describe('runPreflight', () => {
  test.each<{ name: string; codes: Record<string, number>; envPath: string; expected: PreflightProblem[] }>([
    { name: 'all present', codes: {}, envPath: presentEnv, expected: [] },
    {
      name: 'claude missing',
      codes: { 'claude --version': 127 },
      envPath: presentEnv,
      expected: [{ tool: 'claude', message: 'claude is not on PATH' }],
    },
    {
      name: 'gh logged out',
      codes: { 'gh auth status': 1 },
      envPath: presentEnv,
      expected: [{ tool: 'gh-auth', message: 'gh is not logged in; run gh auth login' }],
    },
    {
      name: 'env file missing',
      codes: {},
      envPath: missingEnv,
      expected: [{ tool: 'jira-env', message: `Jira credentials file ${missingEnv} does not exist` }],
    },
    {
      name: 'gh missing',
      codes: { 'gh --version': 127, 'gh auth status': 127 },
      envPath: presentEnv,
      expected: [{ tool: 'gh', message: 'gh is not on PATH' }],
    },
    {
      name: 'git missing',
      codes: { 'git --version': 127 },
      envPath: presentEnv,
      expected: [{ tool: 'git', message: 'git is not on PATH' }],
    },
    {
      name: 'everything missing',
      codes: { 'claude --version': 127, 'gh --version': 127, 'git --version': 127, 'gh auth status': 127 },
      envPath: missingEnv,
      expected: [
        { tool: 'claude', message: 'claude is not on PATH' },
        { tool: 'gh', message: 'gh is not on PATH' },
        { tool: 'git', message: 'git is not on PATH' },
        { tool: 'jira-env', message: `Jira credentials file ${missingEnv} does not exist` },
      ],
    },
  ])('reports $name', async ({ codes, envPath, expected }) => {
    // given
    const run = fakeRunner(codes);
    // when
    const problems = await runPreflight(run, envPath);
    // then
    expect(problems).toEqual(expected);
  });

  test('logs each problem at warn', async () => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    await runPreflight(fakeRunner({ 'claude --version': 127 }), missingEnv, logger);
    // then
    expect(logger.warn.mock.calls).toEqual([
      ['preflight', 'problem', { tool: 'claude', message: 'claude is not on PATH' }],
      ['preflight', 'problem', { tool: 'jira-env', message: `Jira credentials file ${missingEnv} does not exist` }],
    ]);
  });

  test('logs passed when there are no problems', async () => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    await runPreflight(fakeRunner({}), presentEnv, logger);
    // then
    expect(logger.info).toHaveBeenCalledWith('preflight', 'passed');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('defaultRunner', () => {
  test.each([
    { name: 'success', cmd: process.execPath, args: ['-e', 'process.stdout.write("ok")'], code: 0, stdout: 'ok' },
    { name: 'exit code', cmd: process.execPath, args: ['-e', 'process.exit(3)'], code: 3, stdout: '' },
    { name: 'missing command', cmd: join(dir, 'no-such-command'), args: [], code: 127, stdout: '' },
  ])('reports $name', async ({ cmd, args, code, stdout }) => {
    // given
    const run = defaultRunner;
    // when
    const result = await run(cmd, args);
    // then
    expect(result).toMatchObject({ code, stdout });
  });

  test('runs in the given working directory', async () => {
    // given
    const run = defaultRunner;
    // when
    const result = await run(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], dir);
    // then
    expect(result).toMatchObject({ code: 0, stdout: dir });
  });
});
