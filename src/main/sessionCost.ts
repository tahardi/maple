import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { SessionCost } from '@shared/types';
import { projectsDir } from './transcripts';

type Price = { input: number; output: number; cacheRead: number };

const PRICES: Partial<Record<string, Price>> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

const assistantLine = z.object({
  type: z.literal('assistant'),
  message: z.object({
    id: z.string(),
    model: z.string(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().default(0),
      cache_read_input_tokens: z.number().default(0),
      cache_creation: z.object({ ephemeral_1h_input_tokens: z.number() }).optional(),
    }),
  }),
});

async function transcriptFiles(sessionId: string, root: string): Promise<string[] | null> {
  if (!existsSync(root)) {
    return null;
  }
  const dirs = await readdir(root, { withFileTypes: true });
  const project = dirs.find((d) => d.isDirectory() && existsSync(join(root, d.name, `${sessionId}.jsonl`)));
  if (!project) {
    return null;
  }
  const main = join(root, project.name, `${sessionId}.jsonl`);
  const subagentsDir = join(root, project.name, sessionId, 'subagents');
  const subagents = existsSync(subagentsDir)
    ? (await readdir(subagentsDir)).filter((f) => f.endsWith('.jsonl')).map((f) => join(subagentsDir, f))
    : [];
  return [main, ...subagents];
}

export async function sessionCost(sessionId: string, root: string = projectsDir()): Promise<SessionCost | null> {
  const files = await transcriptFiles(sessionId, root);
  if (!files) {
    return null;
  }
  const tokens = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  let dollars: number | null = 0;
  const seen = new Set<string>();
  for (const file of files) {
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const parsed = assistantLine.safeParse(raw);
      if (!parsed.success || seen.has(parsed.data.message.id)) {
        continue;
      }
      const { id, model, usage } = parsed.data.message;
      seen.add(id);
      tokens.inputTokens += usage.input_tokens;
      tokens.outputTokens += usage.output_tokens;
      tokens.cacheWriteTokens += usage.cache_creation_input_tokens;
      tokens.cacheReadTokens += usage.cache_read_input_tokens;
      const price = PRICES[model.replace(/-\d{8}$/, '')];
      if (!price || dollars === null) {
        dollars = null;
        continue;
      }
      const writes1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      const writes5m = usage.cache_creation_input_tokens - writes1h;
      dollars +=
        (usage.input_tokens * price.input +
          usage.output_tokens * price.output +
          writes1h * price.input * 2 +
          writes5m * price.input * 1.25 +
          usage.cache_read_input_tokens * price.cacheRead) /
        1e6;
    }
  }
  return { ...tokens, dollars };
}
