import type { QueueState } from '@shared/types/queue/queueState';
import { useEffect, useState } from 'react';

const EMPTY: QueueState = { cards: [], working: 0, limit: 0, waitingFor: null, failure: null };

export function useStartQueue(): QueueState {
  const [queue, setQueue] = useState<QueueState>(EMPTY);

  useEffect(() => {
    let current = true;
    const unsubscribe = window.maple.tabs.onQueue((state) => {
      current = false;
      setQueue(state);
    });
    void window.maple.tabs
      .startQueue()
      .then((state) => {
        if (current) {
          setQueue(state);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  return queue;
}
