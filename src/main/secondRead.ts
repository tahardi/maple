import { secondReadPrompt } from '@shared/prompts';
import type { Finding } from '@shared/types';
import { z } from 'zod';
import type { Runner } from './preflight';

const MARKER = 'MAPLE-FINDINGS:';

const findingsSchema = z.array(
  z.object({ path: z.string().min(1), line: z.number().int().min(1), text: z.string().min(1) }),
);

export async function secondRead(run: Runner, worktree: string, hooksFile: string, num: number): Promise<Finding[]> {
  const { code, stdout, stderr } = await run(
    'claude',
    [
      '-p',
      secondReadPrompt(num),
      '--dangerously-skip-permissions',
      '--settings',
      hooksFile,
      '--disallowedTools',
      'Edit',
      'Write',
      'NotebookEdit',
    ],
    worktree,
  );
  if (code !== 0) {
    throw new Error(`running second read: ${stderr}`);
  }
  const line = stdout.split('\n').findLast((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) {
    throw new Error('reading second read findings: no MAPLE-FINDINGS line');
  }
  try {
    return findingsSchema.parse(JSON.parse(line.slice(MARKER.length)));
  } catch (err) {
    throw new Error(`reading second read findings: ${err instanceof Error ? err.message : String(err)}`);
  }
}
