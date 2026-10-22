import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { sessionCost } from './sessionCost';

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
};

const usage: Usage = {
  input_tokens: 10,
  output_tokens: 20,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 1000,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 },
};

function assistant(id: string, model = 'claude-sonnet-4-5', u: Usage = usage): string {
  return JSON.stringify({ type: 'assistant', message: { id, model, usage: u } });
}

describe('sessionCost', () => {
  let root: string;
  let dir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'maple-cost-'));
    dir = join(root, '-home-x-maple');
    await mkdir(dir);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('adds up usage once per message id', async () => {
    // given
    const lines = [
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
      assistant('msg_1'),
      assistant('msg_1'),
      '{not json',
      JSON.stringify({ type: 'assistant', message: { id: 'msg_x' } }),
      assistant('msg_2'),
    ];
    await writeFile(join(dir, 's1.jsonl'), lines.join('\n') + '\n');
    // when
    const cost = await sessionCost('s1', root);
    // then
    expect(cost).toMatchObject({ inputTokens: 20, outputTokens: 40, cacheWriteTokens: 200, cacheReadTokens: 2000 });
  });

  test('usage without cache fields counts no cache tokens', async () => {
    // given
    const bare = { input_tokens: 10, output_tokens: 20 } as Usage;
    await writeFile(join(dir, 's1.jsonl'), assistant('msg_1', 'claude-sonnet-4-5', bare) + '\n');
    // when
    const cost = await sessionCost('s1', root);
    // then
    expect(cost).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      dollars: (10 * 3 + 20 * 15) / 1e6,
    });
  });

  test('includes subagent transcripts', async () => {
    // given
    await writeFile(join(dir, 's1.jsonl'), assistant('msg_1') + '\n');
    await mkdir(join(dir, 's1', 'subagents'), { recursive: true });
    await writeFile(join(dir, 's1', 'subagents', 'agent-a.jsonl'), assistant('msg_2') + '\n');
    // when
    const cost = await sessionCost('s1', root);
    // then
    expect(cost).toMatchObject({ inputTokens: 20, outputTokens: 40, cacheWriteTokens: 200, cacheReadTokens: 2000 });
  });

  test.each([
    {
      name: 'sonnet with 1-hour cache writes',
      model: 'claude-sonnet-4-5',
      u: usage,
      want: (10 * 3 + 20 * 15 + 100 * 6 + 1000 * 0.3) / 1e6,
    },
    {
      name: 'sonnet with 5-minute cache writes',
      model: 'claude-sonnet-4-5',
      u: { ...usage, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 0 } },
      want: (10 * 3 + 20 * 15 + 100 * 3.75 + 1000 * 0.3) / 1e6,
    },
    {
      name: 'cache writes without a breakdown as 5-minute',
      model: 'claude-sonnet-4-5',
      u: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 },
      want: (10 * 3 + 20 * 15 + 100 * 3.75 + 1000 * 0.3) / 1e6,
    },
    {
      name: 'a dated model id',
      model: 'claude-haiku-4-5-20251001',
      u: usage,
      want: (10 * 1 + 20 * 5 + 100 * 2 + 1000 * 0.1) / 1e6,
    },
    {
      name: 'opus 5.5 with its own cache read price',
      model: 'claude-opus-5-5',
      u: usage,
      want: (10 * 4 + 20 * 20 + 100 * 8 + 1000 * 0.2) / 1e6,
    },
  ])('prices each model from the price table: $name', async ({ model, u, want }) => {
    // given
    await writeFile(join(dir, 's1.jsonl'), assistant('msg_1', model, u) + '\n');
    // when
    const cost = await sessionCost('s1', root);
    // then
    expect(cost?.dollars).toBeCloseTo(want, 10);
  });

  test('an unknown model counts tokens and leaves dollars null', async () => {
    // given
    const lines = [assistant('msg_1'), assistant('msg_2', 'claude-mystery-9')];
    await writeFile(join(dir, 's1.jsonl'), lines.join('\n') + '\n');
    // when
    const cost = await sessionCost('s1', root);
    // then
    expect(cost).toEqual({
      inputTokens: 20,
      outputTokens: 40,
      cacheWriteTokens: 200,
      cacheReadTokens: 2000,
      dollars: null,
    });
  });

  test('a session with no transcript returns null', async () => {
    // when
    const cost = await sessionCost('s2', root);
    // then
    expect(cost).toBeNull();
  });
});
