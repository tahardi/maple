import { z } from 'zod';
import type { FileChange, FilePair, FileStatus } from '@shared/types/files';
import type { Review } from '@shared/types/github';
import type { Runner as CommandRunner } from '@main/app/preflight';
import { MAX_BYTES } from '@main/app/paths';

const headSchema = z.object({ headRefOid: z.string(), baseRefOid: z.string() });

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);

const filesSchema = z.array(
  z.array(
    z.object({
      filename: z.string(),
      status: z.string(),
      sha: z.string(),
      previous_filename: z.string().optional(),
    }),
  ),
);

const statuses: Record<string, FileStatus> = { added: 'A', removed: 'D', renamed: 'R' };

async function gh(run: CommandRunner, args: string[]): Promise<string> {
  const { code, stdout, stderr } = await run('gh', args, '');
  if (code !== 0) {
    throw new Error(`fetching review: ${stderr}`);
  }
  return stdout;
}

async function readHead(run: CommandRunner, num: number): Promise<z.infer<typeof headSchema>> {
  return headSchema.parse(JSON.parse(await gh(run, ['pr', 'view', String(num), '--json', 'headRefOid,baseRefOid'])));
}

export async function reviewFiles(run: CommandRunner, num: number): Promise<Omit<Review, 'findings'>> {
  const { headRefOid, baseRefOid } = await readHead(run, num);
  const mergeBase = await gh(run, [
    'api',
    `repos/{owner}/{repo}/compare/${baseRefOid}...${headRefOid}`,
    '--jq',
    '.merge_base_commit.sha',
  ]);
  const listed = await gh(run, ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/pulls/${String(num)}/files`]);
  if ((await readHead(run, num)).headRefOid !== headRefOid) {
    throw new Error('fetching review: the PR head moved, try again');
  }

  const files = filesSchema
    .parse(JSON.parse(listed))
    .flat()
    .map((f): FileChange => {
      const status = statuses[f.status] ?? 'M';
      return {
        path: f.filename,
        status,
        oldPath: status === 'R' ? (f.previous_filename ?? null) : null,
        stamp: status === 'D' ? null : f.sha,
      };
    });
  return { number: num, headSha: headRefOid, baseSha: shaSchema.parse(mergeBase.trim()), files };
}

function isRepoPath(path: string): boolean {
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

async function readAt(run: CommandRunner, path: string, sha: string): Promise<string | null> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const { code, stdout, stderr } = await run(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github.raw', `repos/{owner}/{repo}/contents/${encoded}?ref=${sha}`],
    '',
  );
  if (code !== 0 && stderr.includes('HTTP 404')) {
    return null;
  }
  if (code !== 0) {
    throw new Error(`fetching review: ${stderr}`);
  }
  return stdout;
}

export async function reviewFilePair(
  run: CommandRunner,
  path: string,
  oldPath: string | null,
  baseSha: string,
  headSha: string,
): Promise<FilePair> {
  if (!shaSchema.safeParse(baseSha).success || !shaSchema.safeParse(headSha).success) {
    throw new Error('reading review file: invalid commit');
  }
  if (!isRepoPath(path) || (oldPath !== null && !isRepoPath(oldPath))) {
    throw new Error('reading review file: invalid path');
  }

  const [base, current] = await Promise.all([readAt(run, oldPath ?? path, baseSha), readAt(run, path, headSha)]);
  const sides = [base, current].filter((side) => side !== null);
  if (sides.some((side) => side.includes('\0'))) {
    return { kind: 'binary', path };
  }
  const bytes = Math.max(...sides.map((side) => Buffer.byteLength(side)), 0);
  if (bytes > MAX_BYTES) {
    return { kind: 'tooLarge', path, bytes };
  }
  return { kind: 'text', path, base, current };
}
