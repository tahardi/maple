import type { TabStatus } from '@shared/types/tabs/tabStatus';

export function closeNeedsConfirm(statuses: readonly TabStatus[], tabId: string, force: boolean): boolean {
  return !force && statuses.some((s) => s.tabId === tabId && s.dot === 'working');
}
