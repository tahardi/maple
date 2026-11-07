type Price = { input: number; output: number; cacheRead: number };

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_1h_input_tokens?: number };
};

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

export function usageDollars(model: string, usage: Usage): number | null {
  const price = PRICES[model.replace(/-\d{8}$/, '')];
  if (!price) {
    return null;
  }
  const writes = usage.cache_creation_input_tokens ?? 0;
  const writes1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      writes1h * price.input * 2 +
      (writes - writes1h) * price.input * 1.25 +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1e6
  );
}
