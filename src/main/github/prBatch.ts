import { z } from 'zod';
import { parsePrBody } from '@shared/github/prBody';
import type { CheckRun, ChecksSummary, PrInfo } from '@shared/types/github';
import type { Runner } from '@main/app/preflight';

export type RepoBranch = { repo: string; branch: string };
export type BatchResult = Map<string, PrInfo[] | Error>;

const BATCH_SIZE = 100;

const checkRunSchema = z.object({
  __typename: z.literal('CheckRun'),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  startedAt: z.string().nullable(),
});

const statusContextSchema = z.object({
  __typename: z.literal('StatusContext'),
  context: z.string(),
  state: z.string(),
  targetUrl: z.string().nullable(),
});

const contextSchema = z.discriminatedUnion('__typename', [checkRunSchema, statusContextSchema]);

const nodeSchema = z.object({
  number: z.number(),
  url: z.string(),
  title: z.string(),
  state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
  body: z.string(),
  isCrossRepository: z.boolean(),
  headRefOid: z.string(),
  statusCheckRollup: z.object({ contexts: z.object({ nodes: z.array(contextSchema) }) }).nullable(),
});

const aliasSchema = z.object({ pullRequests: z.object({ nodes: z.array(nodeSchema) }) }).nullable();

const responseSchema = z.object({
  data: z.record(z.string(), aliasSchema).nullable().optional(),
  errors: z.array(z.object({ message: z.string(), path: z.array(z.unknown()).optional() })).optional(),
});

export function batchKey({ repo, branch }: RepoBranch): string {
  return JSON.stringify([repo, branch]);
}

function alias({ repo, branch }: RepoBranch, index: number): string {
  const [owner = '', name = ''] = repo.split('/');
  return (
    `p${String(index)}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ` +
    `pullRequests(headRefName: ${JSON.stringify(branch)}, first: 5, states: [OPEN, MERGED, CLOSED], ` +
    'orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number url title state body isCrossRepository ' +
    'headRefName headRefOid statusCheckRollup { contexts(first: 100) { nodes { __typename ' +
    '... on CheckRun { name status conclusion detailsUrl startedAt } ' +
    '... on StatusContext { context state targetUrl } } } } } } }'
  );
}

function chunks(pairs: readonly RepoBranch[]): RepoBranch[][] {
  const out: RepoBranch[][] = [];
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    out.push(pairs.slice(i, i + BATCH_SIZE));
  }
  return out;
}

export function batchQueries(pairs: readonly RepoBranch[]): string[] {
  return chunks(pairs).map((chunk) => `query { ${chunk.map(alias).join(' ')} }`);
}

function bucket(state: string): CheckRun['bucket'] {
  if (state === 'SUCCESS') {
    return 'pass';
  }
  if (state === 'NEUTRAL' || state === 'SKIPPED') {
    return 'skipping';
  }
  if (state === 'CANCELLED') {
    return 'cancel';
  }
  return 'fail';
}

export function checkRun(context: z.infer<typeof contextSchema>): CheckRun {
  if (context.__typename === 'StatusContext') {
    const pending = context.state === 'PENDING' || context.state === 'EXPECTED';
    return {
      name: context.context,
      bucket: pending ? 'pending' : context.state === 'SUCCESS' ? 'pass' : 'fail',
      link: context.targetUrl ?? '',
    };
  }
  return {
    name: context.name,
    bucket: context.status === 'COMPLETED' ? bucket(context.conclusion ?? '') : 'pending',
    link: context.detailsUrl ?? '',
  };
}

function summary(runs: CheckRun[]): ChecksSummary {
  const count = (names: string[]) => runs.filter((r) => names.includes(r.bucket)).length;
  return {
    passed: count(['pass', 'skipping']),
    failed: count(['fail', 'cancel']),
    pending: count(['pending']),
    total: runs.length,
    runs,
  };
}

function newest(contexts: z.infer<typeof contextSchema>[]): z.infer<typeof contextSchema>[] {
  const kept = new Map<string, z.infer<typeof contextSchema>>();
  for (const context of contexts) {
    const name = context.__typename === 'CheckRun' ? `run:${context.name}` : `status:${context.context}`;
    const seen = kept.get(name);
    const later =
      seen?.__typename === 'CheckRun' && context.__typename === 'CheckRun'
        ? (context.startedAt ?? '') > (seen.startedAt ?? '')
        : false;
    if (seen === undefined || later) {
      kept.set(name, context);
    }
  }
  return [...kept.values()];
}

function prInfo(node: z.infer<typeof nodeSchema>): PrInfo {
  return {
    number: node.number,
    url: node.url,
    title: node.title,
    state: node.state,
    body: node.body,
    ...parsePrBody(node.body),
    headSha: node.headRefOid,
    checks: summary(newest(node.statusCheckRollup?.contexts.nodes ?? []).map(checkRun)),
  };
}

export function parsePrBatch(pairs: readonly RepoBranch[], stdout: string): BatchResult {
  const parsed = responseSchema.parse(JSON.parse(stdout));
  const errors = parsed.errors ?? [];
  const result: BatchResult = new Map();
  pairs.forEach((pair, index) => {
    const name = `p${String(index)}`;
    const prs = parsed.data?.[name];
    if (prs) {
      result.set(batchKey(pair), prs.pullRequests.nodes.filter((n) => !n.isCrossRepository).map(prInfo));
      return;
    }
    const own = errors.find((e) => e.path?.[0] === name);
    if (own) {
      result.set(batchKey(pair), new Error(`listing PRs in ${pair.repo}: ${own.message}`));
      return;
    }
    const reason = errors.map((e) => e.message).join('; ') || 'no data returned';
    result.set(batchKey(pair), new Error(`listing PRs: ${reason}`));
  });
  return result;
}

async function fetchChunk(run: Runner, pairs: RepoBranch[], query: string): Promise<BatchResult> {
  const { code, stdout, stderr } = await run('gh', ['api', 'graphql', '-f', `query=${query}`]);
  try {
    return parsePrBatch(pairs, stdout);
  } catch (err) {
    const reason = code !== 0 ? stderr.trim() : err instanceof Error ? err.message : String(err);
    return new Map(pairs.map((pair) => [batchKey(pair), new Error(`listing PRs: ${reason}`)]));
  }
}

export async function fetchPrs(run: Runner, pairs: readonly RepoBranch[]): Promise<BatchResult> {
  const queries = batchQueries(pairs);
  const results = await Promise.all(chunks(pairs).map((chunk, i) => fetchChunk(run, chunk, queries[i])));
  return new Map(results.flatMap((result) => [...result]));
}
