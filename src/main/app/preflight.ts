import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import type { PreflightProblem } from '@shared/types/app';
import { appLogger, type Logger } from './log';

export type Runner = (
  cmd: string,
  args: string[],
  cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export const defaultRunner: Runner = (cmd, args, cwd) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd }, (error, stdout, stderr) => {
      const code = !error ? 0 : error.code === 'ENOENT' ? 127 : typeof error.code === 'number' ? error.code : 1;
      resolve({ code, stdout, stderr });
    });
  });

const tools = ['claude', 'gh', 'git', 'tmux'] as const;
const sandboxTools = ['socat', 'bwrap'] as const;

export async function runPreflight(
  run: Runner,
  jiraEnvPath: string,
  claudeJsonPath: string,
  claudeSettingsPath: string,
  plannerDirs: string[],
  logger: Logger = appLogger,
): Promise<PreflightProblem[]> {
  const problems: PreflightProblem[] = [];
  for (const tool of tools) {
    if ((await run(tool, ['--version'])).code === 127) {
      problems.push({ tool, message: `${tool} is not on PATH` });
    }
  }
  if (!problems.some((p) => p.tool === 'gh') && (await run('gh', ['auth', 'status'])).code !== 0) {
    problems.push({ tool: 'gh-auth', message: 'gh is not logged in; run gh auth login' });
  }
  try {
    await access(jiraEnvPath);
  } catch {
    problems.push({ tool: 'jira-env', message: `Jira credentials file ${jiraEnvPath} does not exist` });
  }
  const trusted = await trustedFolders(claudeJsonPath);
  for (const plannerDir of plannerDirs.filter((d) => !trusted.has(d))) {
    problems.push({
      tool: 'claude-trust',
      message: `trusting folder: ${plannerDir} is not trusted by Claude, run claude there once and choose Yes`,
    });
  }
  problems.push(...(await sandboxProblems(run, claudeSettingsPath)));
  for (const { tool, message } of problems) {
    logger.warn('preflight', 'problem', { tool, message });
  }
  if (problems.length === 0) {
    logger.info('preflight', 'passed');
  }
  return problems;
}

async function sandboxProblems(run: Runner, claudeSettingsPath: string): Promise<PreflightProblem[]> {
  const sandbox = await sandboxSettings(claudeSettingsPath);
  if (sandbox?.enabled !== true) {
    return [];
  }
  const problems: PreflightProblem[] = [];
  if (sandbox.allowUnsandboxedCommands !== false) {
    problems.push({
      tool: 'claude-sandbox',
      message: `sandbox escape hatch is on: set sandbox.allowUnsandboxedCommands to false in ${claudeSettingsPath}`,
    });
  }
  for (const tool of sandboxTools) {
    if ((await run(tool, ['--version'])).code === 127) {
      problems.push({ tool: 'claude-sandbox', message: `${tool} is not on PATH, so the Claude sandbox cannot start` });
    }
  }
  return problems;
}

async function sandboxSettings(
  claudeSettingsPath: string,
): Promise<{ enabled?: unknown; allowUnsandboxedCommands?: unknown } | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(claudeSettingsPath, 'utf8'));
  } catch {
    return null;
  }
  const sandbox = typeof parsed === 'object' && parsed !== null && 'sandbox' in parsed ? parsed.sandbox : null;
  return typeof sandbox === 'object' && sandbox !== null ? sandbox : null;
}

async function trustedFolders(claudeJsonPath: string): Promise<Set<string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(claudeJsonPath, 'utf8'));
  } catch {
    return new Set();
  }
  const projects = typeof parsed === 'object' && parsed !== null && 'projects' in parsed ? parsed.projects : null;
  if (typeof projects !== 'object' || projects === null) {
    return new Set();
  }
  return new Set(
    Object.entries(projects)
      .filter(([, value]: [string, unknown]) => isTrusted(value))
      .map(([path]) => path),
  );
}

function isTrusted(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'hasTrustDialogAccepted' in value &&
    value.hasTrustDialogAccepted === true
  );
}
