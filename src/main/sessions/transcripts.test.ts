import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { hasTranscript } from './transcripts';

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
