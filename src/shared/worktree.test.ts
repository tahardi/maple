import { describe, expect, test } from 'vitest';
import { matchWorktree } from './worktree';

const digDirs = [
  { name: 'dig-days-dig-44-offline-tiles', mtimeMs: 1 },
  { name: 'dig-days-dig-4-login', mtimeMs: 1 },
];

describe('matchWorktree', () => {
  test.each([
    { entries: digDirs, key: 'DIG-4', expected: 'dig-days-dig-4-login' },
    { entries: digDirs, key: 'DIG-44', expected: 'dig-days-dig-44-offline-tiles' },
    {
      entries: [{ name: 'bearclave-zkvm-bear-25-groth16', mtimeMs: 1 }],
      key: 'BEAR-25',
      expected: 'bearclave-zkvm-bear-25-groth16',
    },
    { entries: [{ name: 'halo-halo-15-config', mtimeMs: 1 }], key: 'HALO-15', expected: 'halo-halo-15-config' },
    {
      entries: [
        { name: 'little-things-lt-18-old', mtimeMs: 1 },
        { name: 'little-things-lt-18-new', mtimeMs: 2 },
      ],
      key: 'LT-18',
      expected: 'little-things-lt-18-new',
    },
    { entries: [{ name: 'dig-days-dig-44', mtimeMs: 1 }], key: 'DIG-44', expected: 'dig-days-dig-44' },
    { entries: [], key: 'DIG-9', expected: null },
  ])('matches $key to $expected', ({ entries, key, expected }) => {
    // given
    const dirs = entries;
    // when
    const name = matchWorktree(dirs, key);
    // then
    expect(name).toBe(expected);
  });
});
