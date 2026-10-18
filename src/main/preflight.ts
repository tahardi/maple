import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import type { PreflightProblem } from '@shared/types';

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

const tools = ['claude', 'gh', 'git'] as const;

export async function runPreflight(run: Runner, jiraEnvPath: string): Promise<PreflightProblem[]> {
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
  return problems;
}
