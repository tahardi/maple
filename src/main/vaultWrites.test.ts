import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { vaultWrites } from './vaultWrites';

function toolUse(name: string, input: Record<string, unknown>): string {
  return JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
}

describe('vaultWrites', () => {
  const vault = '/home/me/vault';
  let root = '';
  let dir = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'maple-writes-'));
    dir = join(root, '-home-me-maple');
    await mkdir(join(dir, 's1', 'subagents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('returns the vault notes the session wrote, sorted and without repeats', async () => {
    // given
    await writeFile(
      join(dir, 's1.jsonl'),
      [
        toolUse('Write', { file_path: '/home/me/vault/Projects/Spike.md', content: '' }),
        toolUse('Edit', { file_path: '/home/me/vault/Projects/Spike.md', old_string: 'a', new_string: 'b' }),
        toolUse('MultiEdit', { file_path: '/home/me/vault/Inbox.md', edits: [] }),
        toolUse('mcp__anchorhold__anchorhold_write_note', { path: 'Daily/2026-10-20.md', content: '' }),
        'not json',
      ].join('\n'),
    );
    await writeFile(
      join(dir, 's1', 'subagents', 'agent-1.jsonl'),
      toolUse('Write', { file_path: '/home/me/vault/Research.md', content: '' }),
    );
    // when
    const paths = await vaultWrites('s1', vault, root);
    // then
    expect(paths).toEqual(['Daily/2026-10-20.md', 'Inbox.md', 'Projects/Spike.md', 'Research.md']);
  });

  test.each([
    { name: 'a file outside the vault', line: toolUse('Write', { file_path: '/home/me/code/a.md', content: '' }) },
    { name: 'a sibling with a shared prefix', line: toolUse('Write', { file_path: '/home/me/vault2/a.md' }) },
    { name: 'a non-Markdown file', line: toolUse('Write', { file_path: '/home/me/vault/image.png', content: '' }) },
    { name: 'a read', line: toolUse('Read', { file_path: '/home/me/vault/Inbox.md' }) },
    { name: 'a note path that escapes', line: toolUse('mcp__anchorhold__anchorhold_write_note', { path: '../x.md' }) },
    { name: 'a tool with no path', line: toolUse('Write', { content: '' }) },
  ])('skips $name', async ({ line }) => {
    // given
    await writeFile(join(dir, 's1.jsonl'), line);
    // when
    const paths = await vaultWrites('s1', vault, root);
    // then
    expect(paths).toEqual([]);
  });

  test('returns nothing when the session has no transcript', async () => {
    // given
    const sessionId = 'missing';
    // when
    const paths = await vaultWrites(sessionId, vault, root);
    // then
    expect(paths).toEqual([]);
  });
});
