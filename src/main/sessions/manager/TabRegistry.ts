import type { TabState } from '@shared/types/tabs/tabState';

export class TabRegistry {
  private readonly tabs = new Map<string, TabState>();
  private readonly closed: Record<string, string>;
  private kept: TabState[] = [];

  constructor(closedSessions: Record<string, string>) {
    this.closed = { ...closedSessions };
  }

  add(tab: TabState): void {
    this.tabs.set(tab.id, tab);
  }

  update(tab: TabState): void {
    this.require(tab.id);
    this.tabs.set(tab.id, tab);
  }

  get(tabId: string): TabState | null {
    return this.tabs.get(tabId) ?? null;
  }

  require(tabId: string): TabState {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`finding tab: ${tabId} does not exist`);
    }
    return tab;
  }

  list(): TabState[] {
    return [...this.tabs.values()];
  }

  findCard(projectKey: string, cardKey: string): TabState | null {
    return this.list().find((tab) => tab.projectKey === projectKey && tab.cardKey === cardKey) ?? null;
  }

  findKind(projectKey: string, kind: TabState['kind']): TabState | null {
    return this.list().find((tab) => tab.kind === kind && tab.projectKey === projectKey) ?? null;
  }

  close(tabId: string): TabState | null {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return null;
    }
    this.tabs.delete(tabId);
    if (tab.cardKey !== null) {
      this.closed[tab.cardKey] = tab.sessionId;
    }
    return tab;
  }

  drop(tabId: string): void {
    this.tabs.delete(tabId);
  }

  sessionOf(cardKey: string): string | null {
    const open = this.list().find((tab) => tab.cardKey === cardKey);
    return open?.sessionId ?? this.closedSession(cardKey);
  }

  resumeIdFor(projectKey: string, cardKey: string): string | null {
    const kept = this.kept.find((k) => k.projectKey === projectKey && k.cardKey === cardKey);
    return kept?.sessionId ?? this.closedSession(cardKey);
  }

  keep(tab: TabState): void {
    this.kept.push(tab);
  }

  forgetKept(tab: TabState): void {
    this.kept = this.kept.filter(
      (k) => k.kind !== tab.kind || k.projectKey !== tab.projectKey || k.cardKey !== tab.cardKey,
    );
  }

  snapshot(): { tabs: TabState[]; closedSessions: Record<string, string> } {
    return { tabs: [...this.list(), ...this.kept], closedSessions: { ...this.closed } };
  }

  private closedSession(cardKey: string): string | null {
    return Object.hasOwn(this.closed, cardKey) ? this.closed[cardKey] : null;
  }
}
