import { secondReadPrompt } from '@shared/prompts';
import { describe, expect, test, vi } from 'vitest';
import type { Runner } from './preflight';
import { secondRead } from './secondRead';

type Reply = { code: number; stdout: string; stderr: string };

const fakeRunner = (reply: Reply) => vi.fn<Runner>(() => Promise.resolve(reply));

const ok = (stdout: string): Reply => ({ code: 0, stdout, stderr: '' });

describe('secondRead', () => {
  test('runs claude once in the worktree and returns the findings', async () => {
    // given
    const run = fakeRunner(
      ok('Looks mostly fine.\nMAPLE-FINDINGS: [{"path":"src/a.ts","line":3,"text":"off by one"}]\n'),
    );
    // when
    const findings = await secondRead(run, '/wt', '/cfg/hooksFile.json', 33);
    // then
    expect(findings).toEqual([{ path: 'src/a.ts', line: 3, text: 'off by one' }]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      'claude',
      [
        '-p',
        secondReadPrompt(33),
        '--dangerously-skip-permissions',
        '--settings',
        '/cfg/hooksFile.json',
        '--disallowedTools',
        'Edit',
        'Write',
        'NotebookEdit',
      ],
      '/wt',
    );
  });

  test('returns no findings for an empty list', async () => {
    // given
    const run = fakeRunner(ok('Nothing to add.\nMAPLE-FINDINGS: []\n'));
    // when
    const findings = await secondRead(run, '/wt', '/cfg/hooksFile.json', 33);
    // then
    expect(findings).toEqual([]);
  });

  test.each([
    {
      name: 'claude exits non-zero',
      reply: { code: 1, stdout: '', stderr: 'boom' },
      want: 'running second read: boom',
    },
    { name: 'there is no findings line', reply: ok('All good.\n'), want: 'reading second read findings: ' },
    { name: 'the JSON is bad', reply: ok('MAPLE-FINDINGS: [{'), want: 'reading second read findings: ' },
    {
      name: 'a finding has line 0',
      reply: ok('MAPLE-FINDINGS: [{"path":"src/a.ts","line":0,"text":"x"}]'),
      want: 'reading second read findings: ',
    },
  ])('rejects when $name', async ({ reply, want }) => {
    // given
    const run = fakeRunner(reply);
    // when
    const result = secondRead(run, '/wt', '/cfg/hooksFile.json', 33);
    // then
    await expect(result).rejects.toThrow(want);
  });
});
