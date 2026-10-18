import { parsePrBody } from '@shared/prBody';
import type { ChecksSummary, PrInfo } from '@shared/types';
import { z } from 'zod';
import type { Runner } from './preflight';

const listSchema = z.array(
  z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
    state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
    body: z.string(),
  }),
);

const checksSchema = z.array(z.object({ bucket: z.string() }));

const pendingExitCode = 8;

async function checksFor(run: Runner, worktree: string, num: number): Promise<ChecksSummary> {
  const { code, stdout, stderr } = await run('gh', ['pr', 'checks', String(num), '--json', 'bucket'], worktree);
  if (code !== 0 && code !== pendingExitCode) {
    if (stderr.includes('no checks reported')) {
      return { passed: 0, failed: 0, pending: 0, total: 0 };
    }
    throw new Error(`checking PR: ${stderr}`);
  }
  const buckets = checksSchema.parse(JSON.parse(stdout)).map((c) => c.bucket);
  const count = (names: string[]) => buckets.filter((b) => names.includes(b)).length;
  return {
    passed: count(['pass', 'skipping']),
    failed: count(['fail', 'cancel']),
    pending: count(['pending']),
    total: buckets.length,
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
  const { body, ...info } = pr;
  return { ...info, ...parsePrBody(body), checks: await checksFor(run, worktree, pr.number) };
}

export async function commentOnPr(run: Runner, worktree: string, num: number, body: string): Promise<void> {
  const { code, stderr } = await run('gh', ['pr', 'comment', String(num), '--body', body], worktree);
  if (code !== 0) {
    throw new Error(`commenting on PR: ${stderr}`);
  }
}
