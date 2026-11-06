import { hunkLines } from '@shared/hunkLines';
import { parsePrBody } from '@shared/prBody';
import type { ChecksSummary, PrInfo } from '@shared/types/github';
import { z } from 'zod';
import type { Runner } from '@main/app/preflight';

const listSchema = z.array(
  z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
    state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
    body: z.string(),
  }),
);

const checksSchema = z.array(
  z.object({
    name: z.string(),
    bucket: z.enum(['pass', 'fail', 'pending', 'skipping', 'cancel']),
    link: z.string(),
  }),
);

const filesSchema = z.array(z.array(z.object({ filename: z.string(), patch: z.string().optional() })));

const pinSchema = z.object({ headRefOid: z.string(), headRefName: z.string(), baseRefName: z.string() });

const pendingExitCode = 8;

const SELF_APPROVAL = 'Can not approve your own pull request';

async function checksFor(run: Runner, worktree: string, num: number): Promise<ChecksSummary> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['pr', 'checks', String(num), '--json', 'name,bucket,link'],
    worktree,
  );
  if (code !== 0 && code !== pendingExitCode) {
    if (stderr.includes('no checks reported')) {
      return { passed: 0, failed: 0, pending: 0, total: 0, runs: [] };
    }
    throw new Error(`checking PR: ${stderr}`);
  }
  const runs = checksSchema.parse(JSON.parse(stdout));
  const count = (names: string[]) => runs.filter((r) => names.includes(r.bucket)).length;
  return {
    passed: count(['pass', 'skipping']),
    failed: count(['fail', 'cancel']),
    pending: count(['pending']),
    total: runs.length,
    runs,
  };
}

export async function prForBranch(run: Runner, worktree: string, branch: string): Promise<PrInfo | null> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,url,title,state,body'],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing PRs: ${stderr}`);
  }
  const pr = listSchema.parse(JSON.parse(stdout)).at(0);
  if (!pr) {
    return null;
  }
  return { ...pr, ...parsePrBody(pr.body), checks: await checksFor(run, worktree, pr.number) };
}

export async function headCommit(run: Runner, worktree: string, num: number): Promise<string> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['pr', 'view', String(num), '--json', 'headRefOid', '--jq', '.headRefOid'],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`reading PR head: ${stderr}`);
  }
  return stdout.trim();
}

export async function diffLines(
  run: Runner,
  worktree: string,
  num: number,
): Promise<Record<string, readonly [number, number][]>> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/pulls/${String(num)}/files`],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing PR files: ${stderr}`);
  }
  return Object.fromEntries(
    filesSchema
      .parse(JSON.parse(stdout))
      .flat()
      .map((f) => [f.filename, hunkLines(f.patch ?? '')]),
  );
}

async function ghOut(run: Runner, args: string[], doing: string): Promise<string> {
  const { code, stdout, stderr } = await run('gh', args, '');
  if (code !== 0) {
    throw new Error(`approving PR: ${doing}: ${stderr}`);
  }
  return stdout;
}

function isCardBranch(branch: string, cardKey: string): boolean {
  const key = cardKey.toLowerCase();
  const name = branch.toLowerCase();
  return name === key || name.startsWith(`${key}-`);
}

export async function approveAndMerge(run: Runner, num: number, headSha: string, cardKey: string): Promise<void> {
  const pinned = pinSchema.parse(
    JSON.parse(
      await ghOut(run, ['pr', 'view', String(num), '--json', 'headRefOid,headRefName,baseRefName'], 'reading PR head'),
    ),
  );
  const defaultBranch = (
    await ghOut(run, ['api', 'repos/{owner}/{repo}', '--jq', '.default_branch'], 'reading default branch')
  ).trim();
  if (pinned.headRefOid !== headSha) {
    throw new Error('approving PR: the PR changed after the diff loaded; review it again');
  }
  if (pinned.baseRefName !== defaultBranch) {
    throw new Error(`approving PR: PR targets ${pinned.baseRefName}, not ${defaultBranch}`);
  }
  if (!isCardBranch(pinned.headRefName, cardKey)) {
    throw new Error(`approving PR: branch ${pinned.headRefName} is not for ${cardKey}`);
  }

  const review = await run(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/{owner}/{repo}/pulls/${String(num)}/reviews`,
      '-f',
      'event=APPROVE',
      '-f',
      `commit_id=${headSha}`,
    ],
    '',
  );
  if (review.code !== 0 && !`${review.stdout}${review.stderr}`.includes(SELF_APPROVAL)) {
    throw new Error(`approving PR: reviewing: ${review.stderr}`);
  }

  const merge = await run('gh', ['pr', 'merge', String(num), '--squash', '--match-head-commit', headSha], '');
  if (merge.code !== 0) {
    throw new Error(`approving PR: merging: ${merge.stderr}`);
  }
}
