import type { Card } from '@shared/types/jira';
import type { ChangeSet } from '@shared/types/files';
import type { Fetched } from '@shared/types/app';
import type { PrInfo, Review } from '@shared/types/github';
import type { SessionCost, TabState } from '@shared/types/tabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMaple } from '../store';

type CardData = {
  changes: ChangeSet | null;
  files: string[];
  pr: Fetched<PrInfo> | null;
  review: Fetched<Review> | null;
  card: Card | null;
  cost: SessionCost | null;
};

const REFRESH_MS = 60_000;

export function useCardData(tab: TabState): CardData {
  const [data, setData] = useState<CardData>({
    changes: null,
    files: [],
    pr: null,
    review: null,
    card: null,
    cost: null,
  });
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : null));
  const latest = useRef(0);
  const { id, projectKey, cardKey, worktreePath } = tab;

  const load = useCallback(async (): Promise<void> => {
    const { maple } = window;
    const seq = ++latest.current;
    const [changes, files, pr, review, sprint, cost] = await Promise.all([
      worktreePath === null ? null : maple.repo.changes(id),
      worktreePath === null ? [] : maple.repo.listFiles(id),
      maple.pr.get(id),
      maple.pr.review(id),
      maple.jira.sprint(projectKey),
      maple.tabs.cost(id),
    ]);
    if (seq === latest.current) {
      setData({ changes, files, pr, review, card: sprint.data?.cards.find((c) => c.key === cardKey) ?? null, cost });
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
