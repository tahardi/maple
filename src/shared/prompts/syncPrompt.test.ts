import { describe, expect, test } from 'vitest';
import { syncPrompt } from './syncPrompt';

describe('syncPrompt', () => {
  test('builds the Sync with Main prompt', () => {
    // given
    const key = 'DIG-44';
    // when
    const prompt = syncPrompt(key);
    // then
    expect(prompt).toBe('Run the "Sync with Main" steps from the /card skill for DIG-44.');
  });

  test('names the worktrees to sync', () => {
    // given
    const worktrees = ['/wts/a', '/wts/b'];
    // when
    const prompt = syncPrompt('DIG-44', worktrees);
    // then
    expect(prompt).toBe('Run the "Sync with Main" steps from the /card skill for DIG-44 in /wts/a, /wts/b.');
  });
});
