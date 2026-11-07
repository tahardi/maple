import type { Card } from '@shared/types/jira';
import type { ChangeSet, RepoInfo } from '@shared/types/files';
import type { Fetched } from '@shared/types/app';
import type { PrInfo, Review } from '@shared/types/github';
import type { SessionCost, TabState } from '@shared/types/tabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMaple } from '../store';

type CardData = {
  changes: ChangeSet | null;
  files: string[];
  repo: RepoInfo | null;
  pr: Fetched<PrInfo> | null;
  card: Card | null;
  cost: SessionCost | null;
};

type CardDataWithReview = CardData & { review: Fetched<Review> | null; reloadReview: () => void };

const REFRESH_MS = 60_000;

export function useCardData(tab: TabState): CardDataWithReview {
  const [data, setData] = useState<CardData>({
    changes: null,
    files: [],
    repo: null,
    pr: null,
    card: null,
    cost: null,
  });
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : null));
  const [loaded, setLoaded] = useState<{ number: number; review: Fetched<Review> } | null>(null);
  const latest = useRef(0);
  const latestReview = useRef(0);
  const { id, projectKey, cardKey, worktreePath } = tab;

  const load = useCallback(async (): Promise<void> => {
    const { maple } = window;
    const seq = ++latest.current;
    const [changes, files, repo, pr, sprint, cost] = await Promise.all([
      worktreePath === null ? null : maple.repo.changes(id).catch(() => null),
      worktreePath === null ? [] : maple.repo.listFiles(id).catch(() => []),
      worktreePath === null ? null : maple.repo.info(id).catch(() => null),
      maple.pr.get(id).catch(() => null),
      maple.jira.sprint(projectKey).catch(() => null),
      maple.tabs.cost(id).catch(() => null),
    ]);
    if (seq === latest.current) {
      setData({
        changes,
        files,
        repo,
        pr,
        card: sprint?.data?.cards.find((c) => c.key === cardKey) ?? null,
        cost,
      });
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

  const openNumber = data.pr?.data?.state === 'OPEN' ? data.pr.data.number : null;

  const reloadReview = useCallback((): void => {
    if (openNumber === null) {
      return;
    }
    const seq = ++latestReview.current;
    void window.maple.pr.review(id).then((review) => {
      if (seq === latestReview.current) {
        setLoaded({ number: openNumber, review });
      }
    });
  }, [id, openNumber]);

  useEffect(() => {
    reloadReview();
  }, [reloadReview]);

  return { ...data, review: loaded?.number === openNumber ? loaded.review : null, reloadReview };
}
