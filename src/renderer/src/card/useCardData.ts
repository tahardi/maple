import type { Card, ChangeSet, Fetched, PrInfo, TabState } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMaple } from '../store';

type CardData = { changes: ChangeSet | null; files: string[]; pr: Fetched<PrInfo> | null; card: Card | null };

const REFRESH_MS = 60_000;

export function useCardData(tab: TabState): CardData {
  const [data, setData] = useState<CardData>({ changes: null, files: [], pr: null, card: null });
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : null));
  const latest = useRef(0);
  const { id, projectKey, cardKey, worktreePath } = tab;

  const load = useCallback(async (): Promise<void> => {
    const { maple } = window;
    const seq = ++latest.current;
    const [changes, files, pr, sprint] = await Promise.all([
      worktreePath === null ? null : maple.repo.changes(id),
      worktreePath === null ? [] : maple.repo.listFiles(id),
      maple.pr.get(id),
      maple.jira.sprint(projectKey),
    ]);
    if (seq === latest.current) {
      setData({ changes, files, pr, card: sprint.data?.cards.find((c) => c.key === cardKey) ?? null });
    }
  }, [id, projectKey, cardKey, worktreePath]);

  useEffect(() => {
    const refresh = () => void load();
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const unsubscribe = window.maple.repo.onChanged(id, refresh);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [id, load]);

  useEffect(() => {
    if (dot === 'idle' || dot === 'merged' || dot === 'ready' || dot === 'waiting') {
      void load();
    }
  }, [dot, load]);

  return data;
}
