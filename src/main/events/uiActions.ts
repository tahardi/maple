import type { ActionConfig } from '@shared/types/config/actionConfig';
import type { EventRefs } from '@shared/types/events/eventRecord';
import type { UiActionData } from '@shared/types/events/eventSchemas';
import type { TabState } from '@shared/types/tabs/tabState';
import { appLogger, logFailure, type Logger } from '@main/app/log/log';
import type { ActionRecorder } from '@main/ipc/recordActions';

const RECORDED_CHANNELS: ReadonlySet<string> = new Set([
  'tabs:startCard',
  'tabs:openCard',
  'tabs:openVault',
  'tabs:openLearning',
  'tabs:close',
  'tabs:resume',
  'tabs:startFresh',
  'tabs:selectWorktree',
  'tabs:setActive',
  'session:sendPrompt',
  'jira:moveToSprint',
  'jira:report',
  'findings:decide',
  'findings:override',
  'learning:fromFinding',
  'learning:teach',
]);

type Entry = [EventRefs, UiActionData];

const NO_REFS: EventRefs = { project: null, card: null, tab: null, session: null };

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchedAction(actions: readonly ActionConfig[], text: string, cardKey: string | null): string | null {
  if (cardKey === null) {
    return null;
  }
  const matches = (prompt: string): boolean => {
    const parts = prompt.split('{pr}').map((part) => escapeRegExp(part.replaceAll('{key}', cardKey)));
    return new RegExp(`^${parts.join('\\d*')}$`).test(text);
  };
  return actions.find((action) => matches(action.prompt))?.label ?? null;
}

function tabRefs(tabId: string | null, tab: TabState | null): EventRefs {
  return { project: tab?.projectKey ?? null, card: tab?.cardKey ?? null, tab: tabId, session: tab?.sessionId ?? null };
}

function cardRefs(key: string): EventRefs {
  return { ...NO_REFS, project: key.slice(0, key.lastIndexOf('-')), card: key };
}

export function uiActionRecorder(
  deps: {
    tab: (tabId: string) => TabState | null;
    actions: () => readonly ActionConfig[];
    closeNeedsConfirm: (tabId: string, force: boolean) => boolean;
    append: (refs: EventRefs, data: UiActionData) => Promise<void>;
  },
  logger: Logger = appLogger,
): ActionRecorder {
  const lookup = (tabId: string | null): TabState | null => (tabId === null ? null : deps.tab(tabId));

  const entries = (channel: string, args: readonly unknown[]): Entry[] => {
    const first = asString(args[0]);
    const plain: UiActionData = { channel, action: null, length: null };
    if (channel === 'session:sendPrompt') {
      const tab = lookup(first);
      const text = asString(args[1]) ?? '';
      const action = matchedAction(deps.actions(), text, tab?.cardKey ?? null);
      return [[tabRefs(first, tab), { channel, action, length: text.length }]];
    }
    if (channel === 'jira:moveToSprint') {
      const keys: readonly unknown[] = Array.isArray(args[1]) ? args[1] : [];
      return keys.flatMap((k) => asString(k) ?? []).map((key) => [cardRefs(key), plain]);
    }
    if (channel === 'tabs:startCard' || channel === 'tabs:openCard') {
      return [[{ ...NO_REFS, project: first, card: asString(args[1]) }, plain]];
    }
    if (channel === 'tabs:close' && first !== null && deps.closeNeedsConfirm(first, args[1] === true)) {
      return [];
    }
    if (channel === 'tabs:openVault' || channel === 'tabs:openLearning' || channel === 'learning:teach') {
      return [[{ ...NO_REFS, project: first }, plain]];
    }
    return [[channel === 'jira:report' ? NO_REFS : tabRefs(first, lookup(first)), plain]];
  };

  return (channel, args) => {
    if (!RECORDED_CHANNELS.has(channel)) {
      return;
    }
    void logFailure(logger, 'events', { operation: 'recordUiAction', channel }, async () => {
      await Promise.all(entries(channel, args).map(([refs, data]) => deps.append(refs, data)));
    }).catch(() => undefined);
  };
}
