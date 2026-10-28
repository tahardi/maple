import type { execFile } from 'node:child_process';
import { describe, expect, test, vi } from 'vitest';
import { ghRunner } from './ghRunner';

type Callback = (error: { code?: string | number } | null, stdout: string, stderr: string) => void;

function fakeExecFile(error: { code?: string | number } | null, stdout = '', stderr = '') {
  const fake = vi.fn((_cmd: string, _args: string[], _options: object, callback: Callback) => {
    callback(error, stdout, stderr);
  });
  return { fake, run: fake as unknown as typeof execFile };
}

describe('ghRunner', () => {
  test('runs with GH_REPO set and no working directory', async () => {
    // given
    const { fake, run } = fakeExecFile(null, 'ok');
    // when
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'list'], '/home/dev/wts/x');
    // then
    expect(fake).toHaveBeenCalledWith(
      'gh',
      ['pr', 'list'],
      { env: expect.objectContaining({ GH_REPO: 'tahardi/maple' }) as unknown, maxBuffer: 64 * 1024 * 1024 },
      expect.any(Function),
    );
    expect(fake.mock.calls[0]?.[2]).not.toHaveProperty('cwd');
    expect(result).toEqual({ code: 0, stdout: 'ok', stderr: '' });
  });

  test('overrides a GH_REPO already in the environment', async () => {
    // given
    vi.stubEnv('GH_REPO', 'someone/else');
    const { fake, run } = fakeExecFile(null);
    // when
    await ghRunner('tahardi/maple', run)('gh', ['pr', 'list']);
    // then
    expect(fake.mock.calls[0]?.[2]).toMatchObject({ env: { GH_REPO: 'tahardi/maple' } });
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'a missing command as 127', error: { code: 'ENOENT' }, code: 127 },
    { name: 'a numeric exit code', error: { code: 3 }, code: 3 },
    { name: 'any other failure as 1', error: {}, code: 1 },
  ])('reports $name', async ({ error, code }) => {
    // given
    const { run } = fakeExecFile(error, '', 'boom');
    // when
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'list']);
    // then
    expect(result).toEqual({ code, stdout: '', stderr: 'boom' });
  });
});
