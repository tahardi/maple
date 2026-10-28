import { z } from 'zod';
import type { FindingSeverity, SecurityFinding } from '@shared/types/github';
import type { Runner as CommandRunner } from '@main/app/preflight';

export const FINDING_MARKER = /^<!-- xena-security-finding severity=(high|medium|low) id=([A-Za-z0-9-]{1,40}) -->/;

const MAX_SUMMARY = 200;

const order: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };

const commentsSchema = z.array(
  z.array(
    z.object({
      html_url: z.string(),
      user: z.object({ login: z.string() }).nullable(),
      created_at: z.string(),
      body: z.string().nullable(),
    }),
  ),
);

const severitySchema = z.enum(['high', 'medium', 'low']);

type Comment = { url: string; login: string | null; at: number; body: string };

function accepts(comment: Comment, id: string, me: string): boolean {
  return comment.login === me && comment.body.split(/\r?\n/).includes(`xena-accept ${id}`);
}

export async function openFindings(run: CommandRunner, num: number, me: string): Promise<SecurityFinding[]> {
  const { code, stdout, stderr } = await run(
    'gh',
    ['api', '--paginate', '--slurp', `repos/{owner}/{repo}/issues/${String(num)}/comments`],
    '',
  );
  if (code !== 0) {
    throw new Error(`listing findings: ${stderr}`);
  }

  const raw = commentsSchema.parse(JSON.parse(stdout)).flat();
  const comments: Comment[] = raw.map((c) => ({
    url: c.html_url,
    login: c.user?.login ?? null,
    at: Date.parse(c.created_at),
    body: c.body ?? '',
  }));
  const findings: SecurityFinding[] = [];
  for (const comment of comments) {
    const match = FINDING_MARKER.exec(comment.body);
    if (match === null) {
      continue;
    }
    const [marker, severity, id] = match;
    if (comments.some((later) => later.at > comment.at && accepts(later, id, me))) {
      continue;
    }
    const summary = comment.body
      .slice(marker.length)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '');
    findings.push({
      id,
      severity: severitySchema.parse(severity),
      summary: (summary ?? '').slice(0, MAX_SUMMARY),
      url: comment.url,
    });
  }
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function ghLogin(run: CommandRunner): Promise<string> {
  const { code, stdout, stderr } = await run('gh', ['api', 'user', '--jq', '.login'], '');
  if (code !== 0) {
    throw new Error(`reading gh login: ${stderr}`);
  }
  return stdout.trim();
}
