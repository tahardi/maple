import type { Card } from '@shared/types/jira/card';
import type { ChangeSet } from '@shared/types/files/changeSet';
import type { RepoInfo } from '@shared/types/files/repoInfo';
import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import type { TabState } from '@shared/types/tabs/tabState';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMaple } from '../store';

type CardData = {
  changes: ChangeSet | null;
  files: string[];
  repo: RepoInfo | null;
  pr: Fetched<PrInfo> | null;
  card: Card | null;
  cost: SessionCost | null;
  outsideSprint: boolean;
};

type CardDataWithReview = CardData & {
  review: Fetched<Review> | null;
  reviewUpdated: boolean;
  reloadReview: () => void;
};

const REFRESH_MS = 60_000;

export function useCardData(tab: TabState): CardDataWithReview {
  const [data, setData] = useState<CardData & { worktreePath: string | null }>({
    worktreePath: tab.worktreePath,
    changes: null,
    files: [],
    repo: null,
    pr: null,
    card: null,
    cost: null,
    outsideSprint: false,
  });
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : null));
  const active = useMaple((s) => s.activeTabId === tab.id);
  const [loaded, setLoaded] = useState<{
    worktreePath: string | null;
    number: number;
    review: Fetched<Review>;
    firstHead: string | null;
  } | null>(null);
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
      const cards = sprint?.data?.cards ?? null;
      const card = cards?.find((c) => c.key === cardKey) ?? null;
      setData({ worktreePath, changes, files, repo, pr, card, cost, outsideSprint: cards !== null && card === null });
    }
  }, [id, projectKey, cardKey, worktreePath]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const refresh = () => void load();
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const unsubscribe = window.maple.repo.onChanged(id, refresh);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [active, id, load]);

  useEffect(() => {
    if (dot === 'idle' || dot === 'merged' || dot === 'ready' || dot === 'waiting') {
      void load();
    }
  }, [dot, load]);

  const { worktreePath: loadedFor, ...rest } = data;
  const shown = loadedFor === worktreePath ? rest : { ...rest, changes: null, files: [], repo: null, pr: null };
  const openNumber = shown.pr?.data?.state === 'OPEN' ? shown.pr.data.number : null;
  const openHead = shown.pr?.data?.state === 'OPEN' ? shown.pr.data.headSha : null;

  const reloadReview = useCallback((): void => {
    if (openNumber === null) {
      return;
    }
    const seq = ++latestReview.current;
    void window.maple.pr.review(id).then((review) => {
      if (seq === latestReview.current) {
        setLoaded((prev) => {
          const same = prev?.worktreePath === worktreePath && prev.number === openNumber && prev.firstHead !== null;
          const firstHead = same ? prev.firstHead : (review.data?.headSha ?? null);
          return { worktreePath, number: openNumber, review, firstHead };
        });
      }
    });
  }, [id, worktreePath, openNumber]);

  useEffect(() => {
    reloadReview();
  }, [reloadReview, openHead]);

  const current = loaded?.worktreePath === worktreePath && loaded.number === openNumber ? loaded : null;
  const reviewHead = current?.review.data?.headSha ?? null;
  return {
    ...shown,
    review: current?.review ?? null,
    reviewUpdated: current !== null && reviewHead !== null && reviewHead !== current.firstHead,
    reloadReview,
  };
}
