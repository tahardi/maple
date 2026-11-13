import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { vaultDir as configuredVaultDir } from '@main/app/config/configCache';
import { readFindingsWithJson } from '@main/findings/readFindings';
import { queueFindings } from '@main/findings/queueFindings';
import { saveFindings } from '@main/findings/saveFindings';
import { addFindingEntry } from '@main/learning/notes/addFindingEntry';
import { listLessons } from '@main/learning/notes/listLessons';
import { writeFrontmatter } from '@main/learning/notes/frontmatter';
import { readNote, writeNote } from '@main/vault/vault';
import { errorText } from '@shared/errors/errorText';
import { lessonClass } from '@shared/learning/lessonClass';
import { isLessonPath, LESSON_DIR } from '@shared/learning/lessonPath';
import { lessonPrompt } from '@shared/prompts/lessonPrompt';
import type { IpcDeps } from './index';
import { projectKeyArg, tabIdArg } from './args';
import { handle } from './handle';

const findingIdArg = z.string().min(1).max(20);
const modeArg = z.enum(['now', 'later']);
const lessonPathArg = z.string().max(4096).refine(isLessonPath, 'not a lesson note');

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isMissing(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}

export function registerLearning(
  { watchVault, sessions, status, prs, worktreeFor, findingsDir }: IpcDeps,
  logger: Logger = appLogger,
  vaultDir: () => Promise<string | null> = configuredVaultDir,
): void {
  async function requireVaultDir(doing: string): Promise<string> {
    const dir = await vaultDir();
    if (dir === null) {
      throw new Error(`${doing}: no vaultDir in config`);
    }
    return dir;
  }

  const isWorking = (tabId: string): boolean => status.statuses().some((s) => s.tabId === tabId && s.dot === 'working');

  function readyLearningTab(projectKey: string): TabState | null {
    const tab = sessions.list().find((t) => t.kind === 'learning' && t.projectKey === projectKey) ?? null;
    if (tab === null) {
      return null;
    }
    if (!sessions.isAlive(tab.id)) {
      throw new Error('starting lesson: the Learning session is not running');
    }
    if (isWorking(tab.id)) {
      throw new Error('starting lesson: the Learning session is busy');
    }
    return tab;
  }

  function teach(projectKey: string, tab: TabState | null, note: string): string {
    const prompt = lessonPrompt(note);
    if (tab === null) {
      return sessions.openLearning(projectKey, null, null, prompt).id;
    }
    sessions.sendPrompt(tab.id, prompt);
    return tab.id;
  }

  async function prUrl(tabId: string): Promise<string | null> {
    const worktree = worktreeFor(tabId);
    if (worktree === null) {
      return null;
    }
    try {
      return (await prs.latest(tabId, worktree)).data?.url ?? null;
    } catch (err) {
      logger.warn('learning', 'failed', { operation: 'prs.latest', tabId, error: errorText(err) });
      return null;
    }
  }

  async function readOrNull(dir: string, path: string): Promise<string | null> {
    try {
      return await readNote(dir, path);
    } catch (err) {
      if (isMissing(err)) {
        return null;
      }
      throw err;
    }
  }

  handle('learning', 'list', z.tuple([]), () =>
    logFailure(logger, 'learning', { operation: 'learning:list', args: [] }, async () => {
      const dir = await requireVaultDir('reading lessons');
      watchVault(dir);
      return listLessons(dir);
    }),
  );
  handle('learning', 'setComfortable', z.tuple([z.string().max(4096), z.boolean()]), (path, comfortable) =>
    logFailure(
      logger,
      'learning',
      { operation: 'learning:setComfortable', args: [path, String(comfortable)] },
      async () => {
        const dir = await requireVaultDir('reading lessons');
        if (!isLessonPath(path)) {
          throw new Error(`marking comfortable: ${path} is not a lesson note`);
        }
        await writeNote(dir, path, writeFrontmatter(await readNote(dir, path), { comfortable }));
      },
    ),
  );
  handle('learning', 'fromFinding', z.tuple([tabIdArg, findingIdArg, modeArg]), (tabId, findingId, mode) =>
    logFailure(logger, 'learning', { operation: 'learning:fromFinding', args: [tabId, findingId, mode] }, async () => {
      const card = sessions.get(tabId);
      if (card?.kind !== 'card' || card.cardKey === null) {
        throw new Error('starting lesson: tab has no card');
      }
      const key = card.cardKey;
      return queueFindings(key, async () => {
        if (isWorking(tabId)) {
          throw new Error('starting lesson: Claude is working');
        }
        const dir = await requireVaultDir('starting lesson');
        const learning = mode === 'now' ? readyLearningTab(card.projectKey) : null;
        const read = await readFindingsWithJson(findingsDir, key);
        const finding = read?.file.findings.find((f) => f.id === findingId);
        if (read === null || finding === undefined) {
          throw new Error(`starting lesson: no finding ${findingId} on ${key}`);
        }
        const slug = lessonClass(finding.identity);
        const note = `${LESSON_DIR}/${slug}.md`;
        if (!isLessonPath(note)) {
          throw new Error(`starting lesson: ${slug} is not a lesson class`);
        }
        const entry = { key, id: finding.id, identity: finding.identity, line: finding.line, title: finding.title };
        const text = addFindingEntry(await readOrNull(dir, note), { ...entry, pr: await prUrl(tabId) }, today());
        await mkdir(join(dir, LESSON_DIR), { recursive: true });
        await writeNote(dir, note, text);
        const lesson = { note, mode, at: new Date().toISOString() };
        const findings = read.file.findings.map((f) => (f.id === findingId ? { ...f, lesson } : f));
        await saveFindings(findingsDir, { ...read.file, findings }, read.json);
        return { note, learningTabId: mode === 'now' ? teach(card.projectKey, learning, note) : null };
      });
    }),
  );
  handle('learning', 'teach', z.tuple([projectKeyArg, lessonPathArg]), (projectKey, path) =>
    logFailure(logger, 'learning', { operation: 'learning:teach', args: [projectKey, path] }, async () => {
      await requireVaultDir('starting lesson');
      return teach(projectKey, readyLearningTab(projectKey), path);
    }),
  );
}
