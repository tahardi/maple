import { execFile } from 'node:child_process';
import { z } from 'zod';
import type { ProjectConfig } from '@shared/types/config';
import type { Runner as CommandRunner } from '@main/app/preflight';
import { PR_LIST_LIMIT } from '@main/github/pr';
import { worktreeRepo } from '@shared/worktree';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export function ghRunner(repo: string, run: typeof execFile = execFile): CommandRunner {
  return (cmd, args) =>
    new Promise((resolve) => {
      run(
        cmd,
        args,
        { env: { ...process.env, GH_REPO: repo }, maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          const code = !error ? 0 : error.code === 'ENOENT' ? 127 : typeof error.code === 'number' ? error.code : 1;
          resolve({ code, stdout, stderr });
        },
      );
    });
}

export async function projectRunner(
  projectByKey: (key: string) => Promise<ProjectConfig | null>,
  projectKey: string | null,
  branch: string | null,
  worktree: string | null,
  run: typeof execFile = execFile,
): Promise<CommandRunner> {
  if (projectKey === null) {
    throw new Error('finding project repo: tab has no project');
  }
  const project = await projectByKey(projectKey);
  if (project === null) {
    throw new Error(`finding project repo: unknown project ${projectKey}`);
  }
  if (branch === null || project.otherRepos.length === 0) {
    return ghRunner(project.repo, run);
  }
  const repos = [project.repo, ...project.otherRepos];
  const named = worktree === null ? null : worktreeRepo(worktree, repos);
  if (named !== null) {
    return ghRunner(named, run);
  }
  let withPr: CommandRunner | null = null;
  for (const repo of repos) {
    const runner = ghRunner(repo, run);
    const states = await prStates(runner, repo, branch);
    if (states.includes('OPEN')) {
      return runner;
    }
    if (withPr === null && states.length > 0) {
      withPr = runner;
    }
  }
  return withPr ?? ghRunner(project.repo, run);
}

async function prStates(runner: CommandRunner, repo: string, branch: string): Promise<string[]> {
  const { code, stdout, stderr } = await runner('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
    '--limit',
    PR_LIST_LIMIT,
    '--json',
    'isCrossRepository,state',
  ]);
  if (code !== 0) {
    throw new Error(`finding project repo: listing PRs in ${repo}: ${stderr}`);
  }
  const prs = z.array(z.object({ isCrossRepository: z.boolean(), state: z.string() })).parse(JSON.parse(stdout));
  return prs.filter((pr) => !pr.isCrossRepository).map((pr) => pr.state);
}
