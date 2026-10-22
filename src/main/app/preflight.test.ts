import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { PreflightProblem } from '@shared/types/app';
import { defaultRunner, runPreflight, type Runner } from './preflight';

const dir = mkdtempSync(join(tmpdir(), 'maple-preflight-'));
const presentEnv = join(dir, 'env');
const missingEnv = join(dir, 'missing');
writeFileSync(presentEnv, '');
const claudeJson = join(dir, 'claude.json');
writeFileSync(claudeJson, '{}');
const noSettings = join(dir, 'no-settings.json');

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
      name: 'tmux missing',
      codes: { 'tmux --version': 127 },
      envPath: presentEnv,
      expected: [{ tool: 'tmux', message: 'tmux is not on PATH' }],
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
    const problems = await runPreflight(run, envPath, claudeJson, noSettings, []);
    // then
    expect(problems).toEqual(expected);
  });

  test('logs each problem at warn', async () => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    await runPreflight(fakeRunner({ 'claude --version': 127 }), missingEnv, claudeJson, noSettings, [], logger);
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
    await runPreflight(fakeRunner({}), presentEnv, claudeJson, noSettings, [], logger);
    // then
    expect(logger.info).toHaveBeenCalledWith('preflight', 'passed');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('runPreflight claude trust', () => {
  const trusted = '/work/trusted';
  const untrusted = '/work/untrusted';
  const absent = '/work/absent';
  const parent = '/work/parent';
  const child = '/work/parent/child';
  const contents = JSON.stringify({
    projects: {
      [trusted]: { hasTrustDialogAccepted: true },
      [untrusted]: { hasTrustDialogAccepted: false },
      [parent]: { hasTrustDialogAccepted: true },
    },
  });
  const message = (plannerDir: string) =>
    `trusting folder: ${plannerDir} is not trusted by Claude, run claude there once and choose Yes`;

  test.each<{ name: string; contents: string | null; plannerDirs: string[]; untrustedDirs: string[] }>([
    { name: 'trusted dir', contents, plannerDirs: [trusted], untrustedDirs: [] },
    { name: 'untrusted dir', contents, plannerDirs: [untrusted], untrustedDirs: [untrusted] },
    { name: 'dir missing from the file', contents, plannerDirs: [absent], untrustedDirs: [absent] },
    { name: 'missing file', contents: null, plannerDirs: [trusted, untrusted], untrustedDirs: [trusted, untrusted] },
    { name: 'unparsable file', contents: '{', plannerDirs: [trusted, untrusted], untrustedDirs: [trusted, untrusted] },
    { name: 'trusted parent with untrusted child', contents, plannerDirs: [child], untrustedDirs: [child] },
    { name: 'no projects configured', contents, plannerDirs: [], untrustedDirs: [] },
    {
      name: 'mixed dirs in config order',
      contents,
      plannerDirs: [untrusted, trusted, absent],
      untrustedDirs: [untrusted, absent],
    },
    { name: 'file without projects', contents: '{}', plannerDirs: [trusted], untrustedDirs: [trusted] },
    { name: 'null projects', contents: '{"projects":null}', plannerDirs: [trusted], untrustedDirs: [trusted] },
    { name: 'non-object root', contents: '[]', plannerDirs: [trusted], untrustedDirs: [trusted] },
    {
      name: 'non-object entry',
      contents: JSON.stringify({ projects: { [trusted]: true } }),
      plannerDirs: [trusted],
      untrustedDirs: [trusted],
    },
    {
      name: 'entry without the trust flag',
      contents: JSON.stringify({ projects: { [trusted]: {} } }),
      plannerDirs: [trusted],
      untrustedDirs: [trusted],
    },
    {
      name: 'truthy flag that is not true',
      contents: JSON.stringify({ projects: { [trusted]: { hasTrustDialogAccepted: 'yes' } } }),
      plannerDirs: [trusted],
      untrustedDirs: [trusted],
    },
  ])('reports $name', async ({ contents, plannerDirs, untrustedDirs }) => {
    // given
    const path = join(mkdtempSync(join(tmpdir(), 'maple-claude-json-')), 'claude.json');
    if (contents !== null) {
      writeFileSync(path, contents);
    }
    // when
    const problems = await runPreflight(fakeRunner({}), presentEnv, path, noSettings, plannerDirs);
    // then
    expect(problems).toEqual(untrustedDirs.map((d) => ({ tool: 'claude-trust', message: message(d) })));
  });

  test('reports every project when the file is a directory', async () => {
    // given
    const path = join(mkdtempSync(join(tmpdir(), 'maple-claude-json-')), 'claude.json');
    mkdirSync(path);
    // when
    const problems = await runPreflight(fakeRunner({}), presentEnv, path, noSettings, [trusted, untrusted]);
    // then
    expect(problems).toEqual([trusted, untrusted].map((d) => ({ tool: 'claude-trust', message: message(d) })));
  });

  test('logs each untrusted dir at warn', async () => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const path = join(mkdtempSync(join(tmpdir(), 'maple-claude-json-')), 'claude.json');
    writeFileSync(path, contents);
    // when
    await runPreflight(fakeRunner({}), presentEnv, path, noSettings, [untrusted], logger);
    // then
    expect(logger.warn.mock.calls).toEqual([
      ['preflight', 'problem', { tool: 'claude-trust', message: message(untrusted) }],
    ]);
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('runPreflight claude sandbox', () => {
  const hardened = { sandbox: { enabled: true, allowUnsandboxedCommands: false } };
  const escape = (path: string): PreflightProblem => ({
    tool: 'claude-sandbox',
    message: `sandbox escape hatch is on: set sandbox.allowUnsandboxedCommands to false in ${path}`,
  });
  const missingTool = (tool: string): PreflightProblem => ({
    tool: 'claude-sandbox',
    message: `${tool} is not on PATH, so the Claude sandbox cannot start`,
  });

  test.each<{
    name: string;
    contents: string | null;
    codes: Record<string, number>;
    expected: (path: string) => PreflightProblem[];
  }>([
    {
      name: 'no problems when the sandbox is off',
      contents: JSON.stringify({ sandbox: { enabled: false } }),
      codes: { 'socat --version': 127, 'bwrap --version': 127 },
      expected: () => [],
    },
    {
      name: 'no problems when there is no sandbox block',
      contents: JSON.stringify({ env: { TOKEN: 'secret' } }),
      codes: { 'socat --version': 127 },
      expected: () => [],
    },
    {
      name: 'no problems when the sandbox is hardened',
      contents: JSON.stringify(hardened),
      codes: {},
      expected: () => [],
    },
    {
      name: 'the escape hatch when allowUnsandboxedCommands is missing',
      contents: JSON.stringify({ sandbox: { enabled: true } }),
      codes: {},
      expected: (path) => [escape(path)],
    },
    {
      name: 'the escape hatch when allowUnsandboxedCommands is true',
      contents: JSON.stringify({ sandbox: { enabled: true, allowUnsandboxedCommands: true } }),
      codes: {},
      expected: (path) => [escape(path)],
    },
    {
      name: 'no problems when sandbox is not an object',
      contents: JSON.stringify({ sandbox: true }),
      codes: { 'socat --version': 127 },
      expected: () => [],
    },
    {
      name: 'no problems when enabled is truthy but not true',
      contents: JSON.stringify({ sandbox: { enabled: 'true' } }),
      codes: { 'socat --version': 127 },
      expected: () => [],
    },
    {
      name: 'the escape hatch when allowUnsandboxedCommands is falsy but not false',
      contents: JSON.stringify({ sandbox: { enabled: true, allowUnsandboxedCommands: 'false' } }),
      codes: {},
      expected: (path) => [escape(path)],
    },
    {
      name: 'missing socat',
      contents: JSON.stringify(hardened),
      codes: { 'socat --version': 127 },
      expected: () => [missingTool('socat')],
    },
    {
      name: 'missing bwrap',
      contents: JSON.stringify(hardened),
      codes: { 'bwrap --version': 127 },
      expected: () => [missingTool('bwrap')],
    },
    {
      name: 'only a missing tool, not a failing one',
      contents: JSON.stringify(hardened),
      codes: { 'socat --version': 1 },
      expected: () => [],
    },
    {
      name: 'every sandbox problem',
      contents: JSON.stringify({ sandbox: { enabled: true } }),
      codes: { 'socat --version': 127, 'bwrap --version': 127 },
      expected: (path) => [escape(path), missingTool('socat'), missingTool('bwrap')],
    },
    {
      name: 'no problems when the file is missing',
      contents: null,
      codes: { 'socat --version': 127 },
      expected: () => [],
    },
    {
      name: 'no problems when the file is not JSON',
      contents: '{',
      codes: { 'socat --version': 127 },
      expected: () => [],
    },
    {
      name: 'no problems when the file is JSON null',
      contents: 'null',
      codes: { 'socat --version': 127 },
      expected: () => [],
    },
  ])('reports $name', async ({ contents, codes, expected }) => {
    // given
    const path = join(mkdtempSync(join(tmpdir(), 'maple-claude-settings-')), 'settings.json');
    if (contents !== null) {
      writeFileSync(path, contents);
    }
    // when
    const problems = await runPreflight(fakeRunner(codes), presentEnv, claudeJson, path, []);
    // then
    expect(problems).toEqual(expected(path));
  });

  test('reports no problems when the file is a directory', async () => {
    // given
    const path = join(mkdtempSync(join(tmpdir(), 'maple-claude-settings-')), 'settings.json');
    mkdirSync(path);
    // when
    const problems = await runPreflight(fakeRunner({ 'socat --version': 127 }), presentEnv, claudeJson, path, []);
    // then
    expect(problems).toEqual([]);
  });

  test('logs no settings values besides the sandbox keys it checks', async () => {
    // given
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const path = join(mkdtempSync(join(tmpdir(), 'maple-claude-settings-')), 'settings.json');
    writeFileSync(
      path,
      JSON.stringify({ env: { JIRA_TOKEN: 'secret-token' }, sandbox: { enabled: true, network: 'secret-host' } }),
    );
    // when
    await runPreflight(fakeRunner({ 'bwrap --version': 127 }), presentEnv, claudeJson, path, [], logger);
    // then
    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logged).not.toContain('secret');
    expect(logger.warn.mock.calls).toEqual([
      ['preflight', 'problem', escape(path)],
      ['preflight', 'problem', missingTool('bwrap')],
    ]);
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
