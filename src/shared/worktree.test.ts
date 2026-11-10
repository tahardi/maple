import { describe, expect, test } from 'vitest';
import { matchWorktrees, worktreeRepo } from './worktree';

const digDirs = [
  { name: 'dig-days-dig-44-offline-tiles', mtimeMs: 1 },
  { name: 'dig-days-dig-4-login', mtimeMs: 1 },
];

describe('matchWorktrees', () => {
  test.each([
    { entries: digDirs, key: 'DIG-4', expected: ['dig-days-dig-4-login'] },
    { entries: digDirs, key: 'DIG-44', expected: ['dig-days-dig-44-offline-tiles'] },
    {
      entries: [{ name: 'bearclave-zkvm-bear-25-groth16', mtimeMs: 1 }],
      key: 'BEAR-25',
      expected: ['bearclave-zkvm-bear-25-groth16'],
    },
    { entries: [{ name: 'halo-halo-15-config', mtimeMs: 1 }], key: 'HALO-15', expected: ['halo-halo-15-config'] },
    {
      entries: [
        { name: 'little-things-lt-18-old', mtimeMs: 1 },
        { name: 'little-things-lt-18-new', mtimeMs: 2 },
      ],
      key: 'LT-18',
      expected: ['little-things-lt-18-new', 'little-things-lt-18-old'],
    },
    { entries: [{ name: 'dig-days-dig-44', mtimeMs: 1 }], key: 'DIG-44', expected: ['dig-days-dig-44'] },
    {
      entries: [
        { name: 'xena-xena-62-vm-net', mtimeMs: 1 },
        { name: 'halo-xena-62-config', mtimeMs: 2 },
      ],
      key: 'XENA-62',
      expected: ['halo-xena-62-config', 'xena-xena-62-vm-net'],
    },
    { entries: [], key: 'DIG-9', expected: [] },
    { entries: [{ name: 'dig-days-dig-40', mtimeMs: 1 }], key: 'DIG-4', expected: [] },
    { entries: [{ name: 'halo-halo-4-config', mtimeMs: 1 }], key: 'DIG-4', expected: [] },
    { entries: [{ name: 'maple-xdig-4-login', mtimeMs: 1 }], key: 'DIG-4', expected: [] },
    { entries: [{ name: 'dig-days-dig-4-login', mtimeMs: 1 }], key: 'dig-4', expected: ['dig-days-dig-4-login'] },
  ])('matches $key in $entries.0.name to $expected', ({ entries, key, expected }) => {
    // given
    const dirs = entries;
    // when
    const names = matchWorktrees(dirs, key);
    // then
    expect(names).toEqual(expected);
  });
});

describe('worktreeRepo', () => {
  const repos = ['tahardi/xena', 'tahardi/halo', 'tahardi/bearclave', 'tahardi/bearclave-zkvm'];

  test.each([
    { worktree: '/wts/halo-xena-62-config', want: 'tahardi/halo' },
    { worktree: '/wts/xena-xena-62-vm-net', want: 'tahardi/xena' },
    { worktree: '/wts/bearclave-zkvm-bear-25-groth16', want: 'tahardi/bearclave-zkvm' },
    { worktree: '/wts/bearclave-bear-26-attest', want: 'tahardi/bearclave' },
    { worktree: '/wts/Halo-xena-62-config', want: 'tahardi/halo' },
    { worktree: '/wts/dotclaude-xena-62-skills', want: null },
    { worktree: '/wts/halo', want: null },
  ])('picks $want for $worktree', ({ worktree, want }) => {
    // given
    const configured = repos;
    // when
    const repo = worktreeRepo(worktree, configured);
    // then
    expect(repo).toBe(want);
  });

  test('picks the longest repo name whatever the owner length', () => {
    // given
    const configured = ['a-much-longer-owner/bearclave', 'x/bearclave-zkvm'];
    const worktree = '/wts/bearclave-zkvm-bear-25-groth16';
    // when
    const repo = worktreeRepo(worktree, configured);
    // then
    expect(repo).toBe('x/bearclave-zkvm');
  });
});
