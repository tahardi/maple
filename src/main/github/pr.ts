import { hunkLines } from '@shared/diff/hunkLines';
import { z } from 'zod';
import type { Runner } from '@main/app/preflight';
import { MERGE_TIMEOUT_MS } from '@main/util/commandTimeout';

const filesSchema = z.array(z.object({ filename: z.string(), patch: z.string().optional() }));

const pinSchema = z.object({
  headRefOid: z.string(),
  headRefName: z.string(),
  baseRefName: z.string(),
  isCrossRepository: z.boolean(),
});

const SELF_APPROVAL = 'Can not approve your own pull request';

export async function diffLines(
  run: Runner,
  worktree: string,
  baseSha: string,
  headSha: string,
): Promise<Record<string, readonly [number, number][]>> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['api', `repos/{owner}/{repo}/compare/${baseSha}...${headSha}`, '--jq', '.files'],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`listing PR files: ${stderr}`);
  }
  return Object.fromEntries(filesSchema.parse(JSON.parse(stdout)).map((f) => [f.filename, hunkLines(f.patch ?? '')]));
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
      await ghOut(
        run,
        ['pr', 'view', String(num), '--json', 'headRefOid,headRefName,baseRefName,isCrossRepository'],
        'reading PR head',
      ),
    ),
  );
  const defaultBranch = (
    await ghOut(run, ['api', 'repos/{owner}/{repo}', '--jq', '.default_branch'], 'reading default branch')
  ).trim();
  if (pinned.isCrossRepository) {
    throw new Error('approving PR: PR comes from a fork');
  }
  if (pinned.headRefOid !== headSha) {
    throw new Error(
      'approving PR: the PR has new commits since the review loaded; Approve again once the review updates',
    );
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

  const merge = await run(
    'gh',
    ['pr', 'merge', String(num), '--squash', '--match-head-commit', headSha],
    '',
    MERGE_TIMEOUT_MS,
  );
  if (merge.code !== 0) {
    throw new Error(`approving PR: merging: ${merge.stderr}`);
  }
}
