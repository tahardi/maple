import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { _electron, expect, test } from '@playwright/test';
import { startJiraServer } from './fixtures/jiraServer';

const fixtures = join(import.meta.dirname, 'fixtures');
const cardKey = 'HALO-13';

test.describe('smoke', () => {
  test('starts a card from Home', async () => {
    // given
    const jira = await startJiraServer();
    const root = mkdtempSync(join(tmpdir(), 'maple-e2e-'));
    const configDir = join(root, 'config');
    const plannerDir = join(root, 'planner');
    const worktreesDir = join(root, 'worktrees');
    for (const dir of [configDir, plannerDir, worktreesDir]) {
      mkdirSync(dir);
    }
    const config = readFileSync(join(fixtures, 'config/config.json'), 'utf8')
      .replace('__PLANNER_DIR__', plannerDir)
      .replace('__WORKTREES_DIR__', worktreesDir);
    writeFileSync(join(configDir, 'config.json'), config);
    const jiraEnv = join(root, 'jira.env');
    writeFileSync(jiraEnv, `JIRA_SITE=${jira.url}\n${readFileSync(join(fixtures, 'jira.env'), 'utf8')}`);
    const claudeJson = join(root, 'claude.json');
    writeFileSync(claudeJson, JSON.stringify({ projects: { [plannerDir]: { hasTrustDialogAccepted: true } } }));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== 'XDG_RUNTIME_DIR',
      ),
    );
    const app = await _electron.launch({
      args: ['out/main/index.js'],
      env: {
        ...env,
        PATH: [join(fixtures, 'bin'), env.PATH].join(delimiter),
        MAPLE_CONFIG_DIR: configDir,
        MAPLE_JIRA_ENV: jiraEnv,
        MAPLE_CLAUDE_JSON: claudeJson,
        TMUX_TMPDIR: root,
      },
    });
    const page = await app.firstWindow();
    const cardTabs = page.getByRole('tab', { name: cardKey });

    try {
      for (const status of ['To Do', 'In Progress', 'In Review', 'Done']) {
        await expect(page.getByRole('heading', { name: status, exact: true })).toBeVisible();
      }

      // when
      await page.locator(`[data-key="${cardKey}"]`).click();
      await page.getByRole('button', { name: 'Start', exact: true }).click();

      // then
      await expect(cardTabs).toHaveCount(1);
      const terminal = page.locator('.xterm-rows').filter({ hasText: `/card ${cardKey}` });
      await expect(terminal).toContainText('FAKE CLAUDE --dangerously-skip-permissions');
      await expect(terminal).toContainText(`/card ${cardKey}`);

      // when
      await page.getByRole('tab', { name: 'Home', exact: true }).click();
      await page.locator(`[data-key="${cardKey}"]`).click();
      await page.getByRole('button', { name: 'Go to tab', exact: true }).click();

      // then
      await expect(cardTabs).toHaveCount(1);
      await expect(cardTabs).toHaveAttribute('aria-selected', 'true');
    } finally {
      const closed = app.waitForEvent('close');
      app.process().kill('SIGKILL');
      execFileSync('tmux', ['-L', 'maple', 'kill-server'], { env: { ...env, TMUX_TMPDIR: root } });
      await closed;
      await jira.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
