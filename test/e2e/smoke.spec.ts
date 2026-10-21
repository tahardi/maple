import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { _electron, expect, test, type ElectronApplication } from '@playwright/test';
import { startJiraServer } from './fixtures/jiraServer';

const fixtures = join(import.meta.dirname, 'fixtures');
const cardKey = 'HALO-13';

async function sandbox(jiraDown = false) {
  const jira = await startJiraServer(jiraDown);
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
  const parent = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const env = {
    ...parent,
    PATH: [join(fixtures, 'bin'), parent.PATH].join(delimiter),
    MAPLE_CONFIG_DIR: configDir,
    MAPLE_JIRA_ENV: jiraEnv,
    MAPLE_CLAUDE_JSON: claudeJson,
    TMUX_TMPDIR: root,
  };
  const tmux = (...args: string[]) => execFileSync('tmux', ['-L', 'maple', ...args], { env }).toString();
  const eventsLog = test.info().outputPath('events.log');
  const events = (line: string) => {
    appendFileSync(eventsLog, `${new Date().toISOString()} ${line}\n`);
  };
  const launch = async () => {
    events('launch');
    const app = await _electron.launch({ args: ['--disable-gpu', 'out/main/index.js'], env });
    await app.context().tracing.start({ screenshots: true, snapshots: true });
    app.process().stderr?.on('data', (chunk: Buffer) => {
      events(`stderr ${chunk.toString().trim()}`);
    });
    app.on('window', (page) => {
      events(`window ${page.url()}`);
      page.on('load', () => {
        events('page load');
      });
      page.on('crash', () => {
        events('page crash');
      });
      page.on('close', () => {
        events('page close');
      });
      page.on('console', (msg) => {
        events(`console ${msg.type()} ${msg.text()}`);
      });
      page.on('pageerror', (err) => {
        events(`pageerror ${err.message}`);
      });
    });
    return app;
  };
  const crash = async (app: ElectronApplication) => {
    const exited = new Promise((resolve) => app.process().once('exit', resolve));
    app.process().kill('SIGKILL');
    await exited;
  };
  const cleanup = async (app: ElectronApplication) => {
    for (const [i, page] of app.windows().entries()) {
      await page.screenshot({ path: test.info().outputPath(`window-${String(i)}.png`) }).catch(() => undefined);
    }
    await app
      .context()
      .tracing.stop({ path: test.info().outputPath('app-trace.zip') })
      .catch(() => undefined);
    const closed = app.waitForEvent('close');
    app.process().kill('SIGKILL');
    tmux('kill-server');
    await closed;
    await jira.close();
    const log = join(configDir, 'logs', 'main.log');
    if (existsSync(log)) {
      copyFileSync(log, test.info().outputPath('main.log'));
    }
    writeFileSync(test.info().outputPath('jira-requests.log'), jira.requests.join('\n'));
    rmSync(root, { recursive: true, force: true });
  };
  return { tmux, launch, crash, cleanup };
}

test.describe('smoke', () => {
  test('starts a card from Home', async () => {
    // given
    const { launch, cleanup } = await sandbox();
    const app = await launch();
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
      await cleanup(app);
    }
  });

  test('shows Jira unreachable on Home when Jira is down', async () => {
    // given
    const { launch, cleanup } = await sandbox(true);
    const app = await launch();

    try {
      // when
      const page = await app.firstWindow();

      // then
      await expect(page.getByText('Jira unreachable', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'To Do', exact: true })).toHaveCount(0);
    } finally {
      await cleanup(app);
    }
  });

  test('the report form sits above the Claude pane', async () => {
    // given
    const { launch, cleanup } = await sandbox();
    const app = await launch();
    const page = await app.firstWindow();

    try {
      await expect(page.getByRole('heading', { name: 'To Do', exact: true })).toBeVisible();
      await expect(page.locator('.xterm-rows').first()).toBeVisible();

      // when
      await page.getByRole('button', { name: 'Report', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Report a bug or feature' });
      await dialog.getByRole('textbox', { name: 'Title' }).fill('Crash');

      // then
      await dialog.getByRole('button', { name: 'Submit' }).click({ trial: true, timeout: 5000 });
      await dialog.getByRole('button', { name: 'Cancel' }).click({ timeout: 5000 });
      await expect(dialog).toHaveCount(0);
    } finally {
      await cleanup(app);
    }
  });

  test('a card session survives a crash and the relaunched tab reattaches to it', async () => {
    // given
    const { tmux, launch, crash, cleanup } = await sandbox();
    const first = await launch();
    let app = first;

    try {
      const page = await first.firstWindow();
      await page.locator(`[data-key="${cardKey}"]`).click();
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      const terminal = page.locator('.xterm').filter({ hasText: `/card ${cardKey}` });
      await expect(terminal).toContainText('FAKE CLAUDE --dangerously-skip-permissions');
      await terminal.click();
      await page.keyboard.type('typed before the crash');
      await page.keyboard.press('Enter');
      await expect(terminal).toContainText('typed before the crash');
      const sessions = tmux('ls', '-F', '#{session_name}');

      // when
      await crash(first);
      app = await launch();

      // then
      const relaunched = await app.firstWindow();
      await relaunched.getByRole('tab', { name: cardKey }).click();
      const reattached = relaunched.locator('.xterm').filter({ hasText: `/card ${cardKey}` });
      await expect(reattached).toContainText('typed before the crash');
      await expect(reattached).not.toContainText('--resume');
      expect(tmux('ls', '-F', '#{session_name}')).toBe(sessions);
    } finally {
      await cleanup(app);
    }
  });
});
