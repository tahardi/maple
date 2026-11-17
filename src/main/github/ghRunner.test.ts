import type { execFile } from 'node:child_process';
import { describe, expect, test, vi } from 'vitest';
import { ghRunner } from './ghRunner';
import { COMMAND_TIMEOUT_MS } from '@main/util/commandTimeout';

type ExecError = { code?: string | number | null; killed?: boolean };

type Callback = (error: ExecError | null, stdout: string, stderr: string) => void;

function fakeExecFile(error: ExecError | null, stdout = '', stderr = '') {
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
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'view'], '/home/dev/wts/x');
    // then
    expect(fake).toHaveBeenCalledWith(
      'gh',
      ['pr', 'view'],
      {
        env: expect.objectContaining({ GH_REPO: 'tahardi/maple' }) as unknown,
        maxBuffer: 64 * 1024 * 1024,
        timeout: COMMAND_TIMEOUT_MS,
      },
      expect.any(Function),
    );
    expect(fake.mock.calls[0]?.[2]).not.toHaveProperty('cwd');
    expect(result).toEqual({ code: 0, stdout: 'ok', stderr: '' });
  });

  test('reports a killed command as timing out', async () => {
    // given
    const { run } = fakeExecFile({ killed: true, code: null }, '', 'partial');
    // when
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'view']);
    // then
    expect(result).toEqual({ code: 1, stdout: '', stderr: 'timing out after 30000ms' });
  });

  test('uses the timeout the caller passes', async () => {
    // given
    const { fake, run } = fakeExecFile(null);
    // when
    await ghRunner('tahardi/maple', run)('gh', ['pr', 'merge'], '', 120_000);
    // then
    expect(fake.mock.calls[0]?.[2]).toMatchObject({ timeout: 120_000 });
  });

  test('overrides a GH_REPO already in the environment', async () => {
    // given
    vi.stubEnv('GH_REPO', 'someone/else');
    const { fake, run } = fakeExecFile(null);
    // when
    await ghRunner('tahardi/maple', run)('gh', ['pr', 'view']);
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
    const result = await ghRunner('tahardi/maple', run)('gh', ['pr', 'view']);
    // then
    expect(result).toEqual({ code, stdout: '', stderr: 'boom' });
  });
});
