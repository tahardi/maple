import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { hasTranscript, transcriptOffset } from './transcripts';

describe('hasTranscript', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'maple-transcripts-'));
    await mkdir(join(root, '-home-x-maple'));
    await writeFile(join(root, '-home-x-maple', 'abc.jsonl'), '{}\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test.each([
    { name: 'a session with a transcript', id: 'abc', want: true },
    { name: 'a session without a transcript', id: 'def', want: false },
  ])('$name returns $want', ({ id, want }) => {
    // when
    const has = hasTranscript(id, root);
    // then
    expect(has).toBe(want);
  });

  test('a missing projects folder returns false', () => {
    // when
    const has = hasTranscript('abc', join(root, 'gone'));
    // then
    expect(has).toBe(false);
  });
});

describe('transcriptOffset', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'maple-transcripts-'));
    await mkdir(join(root, '-home-x-maple', 'sub', 'subagents'), { recursive: true });
    await writeFile(join(root, '-home-x-maple', 'abc.jsonl'), '{}\n');
    await writeFile(join(root, '-home-x-maple', 'sub.jsonl'), '{}\n');
    await writeFile(join(root, 'escape.jsonl'), '{}\n');
    await writeFile(join(root, '-home-x-maple', 'sub', 'subagents', 'agent-1.jsonl'), '{"long":"subagent line"}\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test.each([
    { name: 'a session whose main transcript holds one short line', id: 'abc', folder: '', want: 3 },
    { name: 'a session with a subagent transcript', id: 'sub', folder: '', want: 3 },
    { name: 'a session without a transcript', id: 'def', folder: '', want: null },
    { name: 'a missing projects folder', id: 'abc', folder: 'gone', want: null },
    { name: 'a session id that leaves the project folder', id: '../escape', folder: '', want: null },
  ])('$name returns $want', async ({ id, folder, want }) => {
    // given
    const projects = join(root, folder);
    // when
    const offset = await transcriptOffset(id, projects);
    // then
    expect(offset).toBe(want);
  });
});
