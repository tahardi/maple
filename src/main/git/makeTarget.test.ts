import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MAX_BYTES } from '@main/util/paths';
import { hasTryTarget } from './makeTarget';

describe('hasTryTarget', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'maple-make-target-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test.each([
    { name: 'try with a prerequisite', text: 'try: deps', want: true },
    { name: 'try with no prerequisite', text: 'try:', want: true },
    { name: 'a double-colon rule', text: 'try::', want: true },
    { name: 'a space before the colon', text: 'try : deps', want: true },
    { name: 'try after another target', text: 'build:\n\tgo build\ntry: build', want: true },
    { name: 'a variable named try', text: 'try := x', want: false },
    { name: 'a variable starting with try', text: 'try_config_dir := x', want: false },
    { name: 'a target ending in try', text: 'retry:', want: false },
    { name: 'a recipe line', text: '\ttry:', want: false },
    { name: 'only another target', text: 'build:', want: false },
    { name: 'a ::= variable named try', text: 'try ::= x', want: false },
    { name: 'a :::= variable named try', text: 'try :::= x', want: false },
    { name: 'a target starting with try', text: 'try-all:', want: false },
    { name: 'a Makefile too large to read', text: 'try:\n'.padEnd(MAX_BYTES + 1, '#'), want: false },
  ])('$name', async ({ text, want }) => {
    // given
    writeFileSync(join(dir, 'Makefile'), text);
    // when
    const got = await hasTryTarget(dir);
    // then
    expect(got).toBe(want);
  });

  test('returns false when there is no Makefile', async () => {
    // given
    const empty = dir;
    // when
    const got = await hasTryTarget(empty);
    // then
    expect(got).toBe(false);
  });

  test('returns false when Makefile is not a regular file', async () => {
    // given
    mkdirSync(join(dir, 'Makefile'));
    // when
    const got = await hasTryTarget(dir);
    // then
    expect(got).toBe(false);
  });

  test('rethrows an error other than a missing Makefile', async () => {
    // given
    writeFileSync(join(dir, 'plain'), '');
    // when
    const got = hasTryTarget(join(dir, 'plain'));
    // then
    await expect(got).rejects.toThrow('ENOTDIR');
  });
});
