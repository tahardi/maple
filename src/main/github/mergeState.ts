import { z } from 'zod';
import type { Runner } from '@main/app/preflight';
import { PR_LIST_LIMIT } from './pr';

export type Mergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

export type MergeState = { mergeable: Mergeable; headSha: string };

const listSchema = z.array(
  z.object({
    mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
    headRefOid: z.string(),
    isCrossRepository: z.boolean(),
  }),
);

export async function openPrMergeState(run: Runner, worktree: string, branch: string): Promise<MergeState | null> {
  const { code, stdout, stderr } = await run(
    'gh',
    [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'open',
      '--limit',
      PR_LIST_LIMIT,
      '--json',
      'mergeable,headRefOid,isCrossRepository',
    ],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing open PRs: ${stderr}`);
  }
  const pr = listSchema.parse(JSON.parse(stdout)).find((entry) => !entry.isCrossRepository);
  return pr === undefined ? null : { mergeable: pr.mergeable, headSha: pr.headRefOid };
}
