import { describe, expect, test, vi } from 'vitest';
import type { Runner as CommandRunner } from '@main/app/preflight';
import { ghLogin } from './ghLogin';

describe('ghLogin', () => {
  test('returns the desktop gh login', async () => {
    // given
    const run = vi.fn<CommandRunner>(() => Promise.resolve({ code: 0, stdout: 'tahardi\n', stderr: '' }));
    // when
    const login = await ghLogin(run);
    // then
    expect(login).toBe('tahardi');
    expect(run).toHaveBeenCalledWith('gh', ['api', 'user', '--jq', '.login'], '');
  });

  test('reports a failed gh call', async () => {
    // given
    const run = vi.fn<CommandRunner>(() => Promise.resolve({ code: 4, stdout: '', stderr: 'not logged in' }));
    // when
    const result = ghLogin(run);
    // then
    await expect(result).rejects.toThrow('reading gh login: not logged in');
  });
});
