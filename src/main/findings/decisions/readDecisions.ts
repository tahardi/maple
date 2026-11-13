import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { errorText } from '@shared/errors/errorText';
import type { StoredDecision } from './storedDecision';

const KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const time = z.string().max(100);

const decisionsSchema: z.ZodType<StoredDecision[]> = z
  .array(
    z.object({
      id: z.string().max(20),
      identity: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('code'), class: z.string(), file: z.string(), hash: z.string() }),
        z.object({ kind: z.literal('dependency'), advisory: z.string(), package: z.string() }),
      ]),
      decision: z
        .object({
          kind: z.enum(['fix-now', 'fix-later', 'accept-risk', 'not-real']),
          reason: z.string().max(2000).nullable(),
          decidedAt: time,
        })
        .nullable(),
      severityOverride: z.enum(['high', 'medium', 'low']).nullable(),
    }),
  )
  .max(500);

export async function readDecisions(dir: string, key: string): Promise<StoredDecision[]> {
  if (!KEY.test(key)) {
    throw new Error(`reading decisions: bad card key ${key}`);
  }
  const name = `${key}.json`;
  let text: string;
  try {
    text = await readFile(join(dir, name), 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return [];
    }
    throw new Error(`reading decisions: ${name}: ${errorText(err)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`reading decisions: ${name}: not valid JSON`);
  }
  const parsed = decisionsSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`reading decisions: ${name}: ${issue.path.join('.')}: ${issue.message}`);
  }
  return parsed.data;
}
