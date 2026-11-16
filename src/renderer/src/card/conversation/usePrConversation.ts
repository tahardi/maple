import type { PrComment } from '@shared/types/github/prComment';
import { useEffect, useState } from 'react';
import { useMaple } from '@renderer/store';

const NO_COMMENTS: readonly PrComment[] = [];

export function usePrConversation(
  tabId: string,
  enabled: boolean,
  prFetchedAt: string | null,
): { comments: readonly PrComment[]; reload: () => void } {
  const dot = useMaple((s) => (tabId in s.statuses ? s.statuses[tabId].dot : null));
  const [comments, setComments] = useState<readonly PrComment[]>(NO_COMMENTS);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    window.maple.pr.conversation(tabId).then(
      (next) => {
        if (live) {
          setComments(next);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, enabled, prFetchedAt, dot, reads]);

  const reload = () => {
    setReads((n) => n + 1);
  };

  return { comments: enabled ? comments : NO_COMMENTS, reload };
}
