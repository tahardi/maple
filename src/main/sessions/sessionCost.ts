import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { SessionCost } from '@shared/types/tabs';
import { projectsDir, transcriptFiles } from './transcripts';
import { usageDollars } from './usageDollars';

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
      if (dollars !== null) {
        const cost = usageDollars(model, usage);
        dollars = cost === null ? null : dollars + cost;
      }
    }
  }
  return { ...tokens, dollars };
}
