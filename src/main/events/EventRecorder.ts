import type { z } from 'zod';
import type { EventRefs, eventSchemas } from '@shared/types/events';
import type { HookEvent, TabState } from '@shared/types/tabs';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import { withTimeout } from '@main/util/withTimeout';
import type { SessionManager } from '@main/sessions/SessionManager';
import type { StatusEngine } from '@main/sessions/StatusEngine';
import { eventLog, type EventLog } from './eventLog';

type Schemas = typeof eventSchemas;

const LOOKUP_TIMEOUT_MS = 15_000;
const DRAIN_TIMEOUT_MS = 2_000;

type Transcript = { session: string; offset: number } | null;

export type RecorderDeps = {
  sessions: SessionManager;
  status: StatusEngine;
  log?: Pick<EventLog<Schemas>, 'append'>;
  transcriptOffset: (sessionId: string) => Promise<number | null>;
  headSha: (worktree: string) => Promise<string>;
  logger?: Logger;
};

export class EventRecorder {
  private readonly events: Pick<EventLog<Schemas>, 'append'>;
  private readonly log: Logger;
  private readonly tabs = new Map<string, TabState>();
  private readonly resumeFailures = new Set<string>();
  private readonly hookSessions = new Map<string, string>();
  private readonly running = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: RecorderDeps) {
    this.events = deps.log ?? eventLog();
    this.log = deps.logger ?? appLogger;
    deps.sessions.on('spawn', (tabId, prompted, resumed) => {
      const tab = deps.sessions.get(tabId);
      if (tab) {
        this.tabs.set(tabId, tab);
      }
      this.resumeFailures.delete(tabId);
      this.hookSessions.delete(tabId);
      this.running.add(tabId);
      this.record('session.spawn', tabId, null, () => ({ prompted, resumed }));
    });
    deps.sessions.on('changed', (tabs) => {
      for (const tab of tabs.filter((t) => this.tabs.has(t.id))) {
        this.tabs.set(tab.id, tab);
      }
    });
    deps.sessions.on('exit', (tabId, exitCode) => {
      this.record('session.exit', tabId, null, () => ({ exitCode }));
      this.running.delete(tabId);
      if (deps.sessions.get(tabId) === null) {
        this.tabs.delete(tabId);
        this.resumeFailures.delete(tabId);
        this.hookSessions.delete(tabId);
      }
    });
    deps.sessions.on('interrupt', (tabId) => {
      this.record('session.interrupt', tabId, null, () => ({}));
    });
    deps.status.on('status', ({ tabId, resumeFailed, exitCode }) => {
      if (resumeFailed && !this.resumeFailures.has(tabId)) {
        this.resumeFailures.add(tabId);
        this.record('session.resumeFailed', tabId, null, () => ({ exitCode }));
      }
    });
  }

  hook(e: HookEvent): void {
    const sessionId = e.sessionId ?? null;
    if (e.event === 'UserPromptSubmit') {
      this.record('prompt.submitted', e.tabId, sessionId, () => ({}));
    } else if (e.event === 'Notification' && e.notificationType === 'permission_prompt') {
      this.record('permission.prompt', e.tabId, sessionId, () => ({}));
    } else if (e.event === 'SessionStart') {
      this.record('session.start', e.tabId, sessionId, async (_tab, session) => ({
        source: e.source ?? null,
        transcript: await this.transcript(session),
      }));
    } else if (e.event === 'Stop') {
      this.record('session.stop', e.tabId, sessionId, async (tab, session) => ({
        transcript: await this.transcript(session),
        head: await this.head(tab.worktreePath),
        backgroundTasks: e.backgroundTasks ?? [],
      }));
    }
  }

  drain(): Promise<void> {
    const exited = new Promise<void>((resolve) => {
      const check = (): void => {
        if (this.running.size === 0) {
          resolve();
        }
      };
      this.deps.sessions.on('exit', check);
      check();
    });
    const finished = exited.then(() => this.queue);
    return logFailure(this.log, 'events', { operation: 'draining events' }, () =>
      withTimeout(finished, DRAIN_TIMEOUT_MS),
    ).catch(() => undefined);
  }

  private record<T extends keyof Schemas>(
    type: T,
    tabId: string,
    sessionId: string | null,
    data: (tab: TabState, session: string) => z.input<Schemas[T]> | Promise<z.input<Schemas[T]>>,
  ): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return;
    }
    if (sessionId !== null) {
      this.hookSessions.set(tabId, sessionId);
    }
    const session = sessionId ?? this.hookSessions.get(tabId) ?? tab.sessionId;
    const refs: EventRefs = { project: tab.projectKey, card: tab.cardKey, tab: tab.id, session };
    this.queue = this.queue.then(() =>
      logFailure(this.log, 'events', { operation: 'recording event', type }, async () => {
        await this.events.append(type, refs, await data(tab, session));
      }).catch(() => undefined),
    );
  }

  private async transcript(session: string): Promise<Transcript> {
    const offset = await withTimeout(this.deps.transcriptOffset(session), LOOKUP_TIMEOUT_MS);
    return offset === null ? null : { session, offset };
  }

  private async head(worktree: string | null): Promise<string | null> {
    if (worktree === null) {
      return null;
    }
    const fields = { operation: 'recording event', type: 'session.stop' };
    return logFailure(this.log, 'events', fields, () =>
      withTimeout(this.deps.headSha(worktree), LOOKUP_TIMEOUT_MS),
    ).catch(() => null);
  }
}
