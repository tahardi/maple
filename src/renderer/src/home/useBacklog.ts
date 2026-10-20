import type { BacklogGroup, Fetched } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';

const REFRESH_MS = 60_000;

export function useBacklog(projectKey: string): {
  backlog: Fetched<BacklogGroup[]> | null;
  refresh: () => void;
} {
  const [loaded, setLoaded] = useState<{ projectKey: string; backlog: Fetched<BacklogGroup[]> } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const load = () => {
      void window.maple.jira.backlog(projectKey).then((backlog) => {
        if (live) {
          setLoaded({ projectKey, backlog });
        }
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [projectKey, tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { backlog: loaded?.projectKey === projectKey ? loaded.backlog : null, refresh };
}
