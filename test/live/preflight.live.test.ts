import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { expandHome } from '../../src/main/app/config';
import { createLogger } from '../../src/main/app/log';
import { defaultRunner, runPreflight } from '../../src/main/app/preflight';

describe('preflight', () => {
  test('passes on this machine and flags only a folder Claude has not trusted', async () => {
    // given
    const untrusted = await mkdtemp(join(tmpdir(), 'maple-live-untrusted-'));
    const jiraEnv = expandHome(process.env.MAPLE_JIRA_ENV ?? '~/.config/jira/env');
    const claudeJson = expandHome(process.env.MAPLE_CLAUDE_JSON ?? '~/.claude.json');
    const claudeSettings = expandHome(process.env.MAPLE_CLAUDE_SETTINGS ?? '~/.claude/settings.json');
    const trusted = expandHome('~/Documents/code/maple');
    // when
    const problems = await runPreflight(
      defaultRunner,
      jiraEnv,
      claudeJson,
      claudeSettings,
      [trusted, untrusted],
      createLogger(() => undefined),
    ).finally(() => rm(untrusted, { recursive: true, force: true }));
    // then
    expect(problems).toEqual([
      {
        tool: 'claude-trust',
        message: `trusting folder: ${untrusted} is not trusted by Claude, run claude there once and choose Yes`,
      },
    ]);
  });
});
