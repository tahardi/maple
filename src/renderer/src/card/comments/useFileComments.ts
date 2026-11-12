import type { DiffLines } from '@shared/types/files/diffLines';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import { useEffect, useState } from 'react';
import { useMaple } from '@renderer/store';

const NO_COMMENTS: readonly ReviewComment[] = [];

export function useFileComments({
  tabId,
  canComment,
  review,
  activeFile,
  prFetchedAt,
  onComments,
}: {
  tabId: string;
  canComment: boolean;
  review: Review | null;
  activeFile: string | null;
  prFetchedAt: string | null;
  onComments?: (comments: readonly ReviewComment[]) => void;
}): { comments: readonly ReviewComment[]; diff: ({ headSha: string } & DiffLines) | null; refresh: () => void } {
  const dot = useMaple((s) => (tabId in s.statuses ? s.statuses[tabId].dot : null));
  const [comments, setComments] = useState<readonly ReviewComment[]>(NO_COMMENTS);
  const [commentsRead, setCommentsRead] = useState(0);
  const [diff, setDiff] = useState<({ headSha: string } & DiffLines) | null>(null);
  const headSha = review?.headSha ?? null;
  const baseSha = review?.baseSha ?? null;

  useEffect(() => {
    if (!canComment) {
      return;
    }
    let live = true;
    window.maple.pr.comments(tabId).then(
      (next) => {
        if (live) {
          setComments(next);
          onComments?.(next);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, canComment, commentsRead, prFetchedAt, dot, onComments]);

  useEffect(() => {
    if (!canComment || headSha === null || baseSha === null) {
      return;
    }
    let live = true;
    window.maple.pr.diffLines(tabId, baseSha, headSha).then(
      (next) => {
        if (live) {
          setDiff({ headSha, ...next });
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, canComment, commentsRead, activeFile, headSha, baseSha]);

  const refresh = () => {
    setCommentsRead((n) => n + 1);
  };

  return { comments, diff, refresh };
}
