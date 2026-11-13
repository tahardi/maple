import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Finding } from '@shared/types/findings/finding';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import type { IpcDeps } from './index';
import { registerLearning } from './learning';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const { handle } = vi.hoisted(() => ({ handle: vi.fn<(channel: string, handler: Handler) => void>() }));

vi.mock('electron', () => ({ ipcMain: { handle } }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const NOTE = '---\nclass: xss\ncomfortable: false\naliases: [a, b]\n---\n# XSS\n\n## Findings\n';

const PR = 'https://github.com/tahardi/maple/pull/9';
const LESSON = 'Learning/Security/command-injection.md';

function tabOf(id: string, kind: TabState['kind'], cardKey: string | null): TabState {
  return { id, projectKey: 'MPL', kind, cardKey, sessionId: `s-${id}`, worktreePath: null, worktreePaths: [] };
}

function finding(id: string, fields: Partial<Finding> = {}): Finding {
  return {
    id,
    identity: { kind: 'code', class: 'command-injection', file: 'src/main/x.ts', hash: '0123456789abcdef' },
    line: 42,
    severity: 'high',
    sources: ['security-pass'],
    title: 'Branch name reaches a shell',
    what: 'w',
    how: 'h',
    impact: 'i',
    defense: 'd',
    chips: [],
    applied: null,
    decision: null,
    severityOverride: null,
    ...fields,
  };
}

type World = {
  findingsDir?: string;
  tabs?: TabState[];
  dots?: Record<string, TabStatus['dot']>;
  alive?: string[];
  noWorktree?: boolean;
};

function register(vaultDir: string | null, world: World = {}) {
  const watchVault = vi.fn<(dir: string) => void>();
  const tabs = world.tabs ?? [];
  const learning = tabOf('learn-new', 'learning', null);
  const sessions = {
    get: (id: string) => tabs.find((t) => t.id === id) ?? null,
    list: () => tabs,
    isAlive: (id: string) => (world.alive ?? []).includes(id),
    openLearning: vi.fn(() => learning),
    sendPrompt: vi.fn(),
  };
  const dots = world.dots ?? {};
  const statuses = () => Object.entries(dots).map(([tabId, dot]) => ({ tabId, dot }));
  const latest = vi.fn(() => Promise.resolve({ data: { url: PR }, error: null, fetchedAt: 'now' }));
  const deps = {
    watchVault,
    sessions,
    status: { statuses },
    prs: { latest, refresh: vi.fn() },
    worktreeFor: () => (world.noWorktree === true ? null : '/wts/mpl-1'),
    findingsDir: world.findingsDir ?? '/nowhere',
  };
  registerLearning(deps as unknown as IpcDeps, logger, () => Promise.resolve(vaultDir));
  const invoke = (channel: string, ...args: unknown[]): unknown => {
    const call = handle.mock.calls.findLast(([name]) => name === channel);
    if (!call) {
      throw new Error(`finding handler: ${channel} is not registered`);
    }
    return call[1]({} as IpcMainInvokeEvent, ...args);
  };
  return { invoke, watchVault, sessions, latest, dots };
}

describe('registerLearning', () => {
  let vault = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vault = mkdtempSync(join(tmpdir(), 'maple-learning-'));
    mkdirSync(join(vault, 'Learning', 'Security'), { recursive: true });
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), NOTE);
    writeFileSync(join(vault, 'Inbox.md'), NOTE);
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  test('learning:list returns summaries', async () => {
    // given
    const { invoke, watchVault } = register(vault);
    // when
    const got = await invoke('learning:list');
    // then
    expect(got).toEqual([
      {
        path: 'Learning/Security/xss.md',
        slug: 'xss',
        title: 'XSS',
        status: 'to-learn',
        comfortable: false,
        lastGrade: null,
        findings: 0,
        hasLesson: false,
        pending: 0,
        error: null,
      },
    ]);
    expect(watchVault).toHaveBeenCalledWith(vault);
  });

  test('learning:setComfortable writes the flag and keeps the rest of the note', async () => {
    // given
    const { invoke } = register(vault);
    // when
    await invoke('learning:setComfortable', 'Learning/Security/xss.md', true);
    // then
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(
      NOTE.replace('comfortable: false', 'comfortable: true'),
    );
  });

  test('learning:setComfortable can unmark a note', async () => {
    // given
    const marked = NOTE.replace('comfortable: false', 'comfortable: true');
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), marked);
    const { invoke } = register(vault);
    // when
    await invoke('learning:setComfortable', 'Learning/Security/xss.md', false);
    // then
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(NOTE);
  });

  test('learning:setComfortable leaves a note with bad YAML unchanged', async () => {
    // given
    const bad = '---\nstatus: [x\n---\n# XSS\n';
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), bad);
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:setComfortable', 'Learning/Security/xss.md', true);
    // then
    await expect(got).rejects.toThrow(/^writing frontmatter: /);
    expect(readFileSync(join(vault, 'Learning', 'Security', 'xss.md'), 'utf8')).toBe(bad);
  });

  test('learning:setComfortable creates nothing for a missing note', async () => {
    // given
    const { invoke } = register(vault);
    // when
    const got = invoke('learning:setComfortable', 'Learning/Security/gone.md', true);
    // then
    await expect(got).rejects.toThrow('ENOENT');
    expect(existsSync(join(vault, 'Learning', 'Security', 'gone.md'))).toBe(false);
  });

  test.each(['Inbox.md', '../x.md', 'Learning/Security/../../Inbox.md'])(
    'learning:setComfortable refuses a path outside Learning/Security: %s',
    async (path) => {
      // given
      const { invoke } = register(vault);
      // when
      const got = invoke('learning:setComfortable', path, true);
      // then
      await expect(got).rejects.toThrow(`marking comfortable: ${path} is not a lesson note`);
      expect(readFileSync(join(vault, 'Inbox.md'), 'utf8')).toBe(NOTE);
    },
  );

  test.each([
    { channel: 'learning:list', args: [] },
    { channel: 'learning:setComfortable', args: ['Learning/Security/xss.md', true] },
  ])('$channel rejects and logs without a vaultDir', async ({ channel, args }) => {
    // given
    const { invoke } = register(null);
    // when
    const got = invoke(channel, ...args);
    // then
    await expect(got).rejects.toThrow('reading lessons: no vaultDir in config');
    expect(logger.warn).toHaveBeenCalledWith('learning', 'failed', expect.objectContaining({ operation: channel }));
  });
  describe('fromFinding and teach', () => {
    const CARD = tabOf('card-1', 'card', 'MPL-1');
    const LEARNING = tabOf('learn-1', 'learning', null);
    let findingsDir = '';
    let findingsJson = '';

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 13, 12, 0, 0));
      findingsDir = join(vault, 'findings');
      mkdirSync(findingsDir);
      findingsJson = JSON.stringify({
        version: 1,
        card: 'MPL-1',
        round: 1,
        headSha: 'a'.repeat(40),
        updatedAt: '2026-11-12T12:00:00.000Z',
        resume: null,
        findings: [
          finding('F1', { extra: 'kept' } as Partial<Finding>),
          finding('F2', { identity: { kind: 'code', class: 'Bad Class', file: 'a', hash: 'h' } }),
        ],
      });
      writeFileSync(join(findingsDir, 'MPL-1.json'), findingsJson);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const notePath = () => join(vault, 'Learning', 'Security', 'command-injection.md');
    const savedFindings = () =>
      JSON.parse(readFileSync(join(findingsDir, 'MPL-1.json'), 'utf8')) as { findings: Record<string, unknown>[] };

    test('fromFinding later writes the entry and the lesson field and sends no prompt', async () => {
      // given
      const { invoke, sessions, latest } = register(vault, { findingsDir, tabs: [CARD] });
      // when
      const got = await invoke('learning:fromFinding', 'card-1', 'F1', 'later');
      // then
      expect(got).toEqual({ note: LESSON, learningTabId: null });
      expect(latest).toHaveBeenCalledWith('card-1', '/wts/mpl-1');
      expect(readFileSync(notePath(), 'utf8')).toContain(
        `### 2026-11-13 MPL-1 F1: Branch name reaches a shell\n- PR: ${PR}\n- Code: \`src/main/x.ts:42\`\n`,
      );
      expect(savedFindings().findings[0]).toMatchObject({
        extra: 'kept',
        lesson: { note: LESSON, mode: 'later', at: expect.any(String) as string },
      });
      expect(sessions.openLearning).not.toHaveBeenCalled();
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
    });

    test('fromFinding now opens the learning tab with the prompt', async () => {
      // given
      const { invoke, sessions } = register(vault, { findingsDir, tabs: [CARD] });
      // when
      const got = await invoke('learning:fromFinding', 'card-1', 'F1', 'now');
      // then
      expect(got).toEqual({ note: LESSON, learningTabId: 'learn-new' });
      expect(sessions.openLearning).toHaveBeenCalledWith('MPL', null, null, `/learn ${LESSON}`);
      expect(savedFindings().findings[0]).toMatchObject({ lesson: { note: LESSON, mode: 'now' } });
    });

    test('fromFinding now sends the prompt to an idle learning tab', async () => {
      // given
      const { invoke, sessions } = register(vault, {
        findingsDir,
        tabs: [CARD, LEARNING],
        alive: ['learn-1'],
        dots: { 'learn-1': 'idle' },
      });
      // when
      const got = await invoke('learning:fromFinding', 'card-1', 'F1', 'now');
      // then
      expect(got).toEqual({ note: LESSON, learningTabId: 'learn-1' });
      expect(sessions.sendPrompt).toHaveBeenCalledWith('learn-1', `/learn ${LESSON}`);
      expect(sessions.openLearning).not.toHaveBeenCalled();
    });

    test('fromFinding writes none yet when the PR lookup fails', async () => {
      // given
      const { invoke, latest } = register(vault, { findingsDir, tabs: [CARD] });
      latest.mockRejectedValueOnce(new Error('gh down'));
      // when
      await invoke('learning:fromFinding', 'card-1', 'F1', 'later');
      // then
      expect(readFileSync(notePath(), 'utf8')).toContain('- PR: none yet\n');
      expect(logger.warn).toHaveBeenCalled();
    });

    test.each<{ name: string; vaultDir: boolean; world: World; id: string; error: string }>([
      {
        name: 'card working',
        vaultDir: true,
        world: { tabs: [CARD], dots: { 'card-1': 'working' } },
        id: 'F1',
        error: 'starting lesson: Claude is working',
      },
      {
        name: 'learning tab working',
        vaultDir: true,
        world: { tabs: [CARD, LEARNING], alive: ['learn-1'], dots: { 'learn-1': 'working' } },
        id: 'F1',
        error: 'starting lesson: the Learning session is busy',
      },
      {
        name: 'learning tab not alive',
        vaultDir: true,
        world: { tabs: [CARD, LEARNING] },
        id: 'F1',
        error: 'starting lesson: the Learning session is not running',
      },
      {
        name: 'unknown finding',
        vaultDir: true,
        world: { tabs: [CARD] },
        id: 'F3',
        error: 'starting lesson: no finding F3 on MPL-1',
      },
      {
        name: 'class that is not a lesson name',
        vaultDir: true,
        world: { tabs: [CARD] },
        id: 'F2',
        error: 'starting lesson: Bad Class is not a lesson class',
      },
      {
        name: 'no vaultDir',
        vaultDir: false,
        world: { tabs: [CARD] },
        id: 'F1',
        error: 'starting lesson: no vaultDir in config',
      },
    ])('fromFinding now refuses with $name and writes nothing', async ({ vaultDir, world, id, error }) => {
      // given
      const { invoke, sessions } = register(vaultDir ? vault : null, { ...world, findingsDir });
      // when
      const got = invoke('learning:fromFinding', 'card-1', id, 'now');
      // then
      await expect(got).rejects.toThrow(error);
      expect(existsSync(notePath())).toBe(false);
      expect(readFileSync(join(findingsDir, 'MPL-1.json'), 'utf8')).toBe(findingsJson);
      expect(sessions.openLearning).not.toHaveBeenCalled();
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
    });

    test('fromFinding now refuses when the Learning session gets busy during the PR lookup', async () => {
      // given
      const { invoke, sessions, latest, dots } = register(vault, {
        findingsDir,
        tabs: [CARD, LEARNING],
        alive: ['learn-1'],
        dots: { 'learn-1': 'idle' },
      });
      latest.mockImplementationOnce(() => {
        dots['learn-1'] = 'working';
        return Promise.resolve({ data: { url: PR }, error: null, fetchedAt: 'now' });
      });
      // when
      const got = invoke('learning:fromFinding', 'card-1', 'F1', 'now');
      // then
      await expect(got).rejects.toThrow('starting lesson: the Learning session is busy');
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
      expect(existsSync(notePath())).toBe(false);
    });

    test.each<{ name: string; world: World }>([
      { name: 'busy', world: { tabs: [CARD, LEARNING], alive: ['learn-1'], dots: { 'learn-1': 'working' } } },
      { name: 'not running', world: { tabs: [CARD, LEARNING] } },
    ])('fromFinding later works while the Learning session is $name', async ({ world }) => {
      // given
      const { invoke, sessions } = register(vault, { ...world, findingsDir });
      // when
      const got = await invoke('learning:fromFinding', 'card-1', 'F1', 'later');
      // then
      expect(got).toEqual({ note: LESSON, learningTabId: null });
      expect(existsSync(notePath())).toBe(true);
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
    });

    test.each([
      { name: 'an unknown tab', tabId: 'gone' },
      { name: 'a learning tab', tabId: 'learn-1' },
    ])('fromFinding refuses $name', async ({ tabId }) => {
      // given
      const { invoke } = register(vault, { findingsDir, tabs: [CARD, LEARNING], alive: ['learn-1'] });
      // when
      const got = invoke('learning:fromFinding', tabId, 'F1', 'later');
      // then
      await expect(got).rejects.toThrow('starting lesson: tab has no card');
      expect(existsSync(notePath())).toBe(false);
    });

    test('fromFinding later then now keeps one entry and saves the mode as now', async () => {
      // given
      const { invoke } = register(vault, { findingsDir, tabs: [CARD] });
      await invoke('learning:fromFinding', 'card-1', 'F1', 'later');
      // when
      await invoke('learning:fromFinding', 'card-1', 'F1', 'now');
      // then
      expect(readFileSync(notePath(), 'utf8').match(/MPL-1 F1: /g)).toHaveLength(1);
      expect(savedFindings().findings[0]).toMatchObject({ lesson: { mode: 'now' } });
    });

    test('fromFinding writes none yet without asking for a PR when the tab has no worktree', async () => {
      // given
      const { invoke, latest } = register(vault, { findingsDir, tabs: [CARD], noWorktree: true });
      // when
      await invoke('learning:fromFinding', 'card-1', 'F1', 'later');
      // then
      expect(readFileSync(notePath(), 'utf8')).toContain('- PR: none yet\n');
      expect(latest).not.toHaveBeenCalled();
    });

    test('teach sends the prompt for a note', async () => {
      // given
      const { invoke, sessions } = register(vault, {
        tabs: [LEARNING],
        alive: ['learn-1'],
        dots: { 'learn-1': 'idle' },
      });
      // when
      const got = await invoke('learning:teach', 'MPL', 'Learning/Security/xss.md');
      // then
      expect(got).toBe('learn-1');
      expect(sessions.sendPrompt).toHaveBeenCalledWith('learn-1', '/learn Learning/Security/xss.md');
    });

    test('teach opens the learning tab with the prompt when none is open', async () => {
      // given
      const { invoke, sessions } = register(vault);
      // when
      const got = await invoke('learning:teach', 'MPL', 'Learning/Security/xss.md');
      // then
      expect(got).toBe('learn-new');
      expect(sessions.openLearning).toHaveBeenCalledWith('MPL', null, null, '/learn Learning/Security/xss.md');
    });

    test.each(['Learning/Security/../../x.md', 'Notes/x.md', 'Learning/Security/Bad Name.md'])(
      'teach refuses a path that is not a lesson note: %s',
      (path) => {
        // given
        const { invoke, sessions } = register(vault, { tabs: [LEARNING], alive: ['learn-1'] });
        // when
        const got = () => invoke('learning:teach', 'MPL', path);
        // then
        expect(got).toThrow('handling learning:teach: arguments are invalid');
        expect(sessions.sendPrompt).not.toHaveBeenCalled();
        expect(sessions.openLearning).not.toHaveBeenCalled();
      },
    );

    test('teach refuses when the Learning session has exited', async () => {
      // given
      const { invoke, sessions } = register(vault, { tabs: [LEARNING] });
      // when
      const got = invoke('learning:teach', 'MPL', 'Learning/Security/xss.md');
      // then
      await expect(got).rejects.toThrow('starting lesson: the Learning session is not running');
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
    });

    test('teach refuses while the learning tab is busy', async () => {
      // given
      const { invoke, sessions } = register(vault, {
        tabs: [LEARNING],
        alive: ['learn-1'],
        dots: { 'learn-1': 'working' },
      });
      // when
      const got = invoke('learning:teach', 'MPL', 'Learning/Security/xss.md');
      // then
      await expect(got).rejects.toThrow('starting lesson: the Learning session is busy');
      expect(sessions.sendPrompt).not.toHaveBeenCalled();
    });
  });
});
