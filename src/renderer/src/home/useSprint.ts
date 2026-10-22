import type { Fetched } from '@shared/types/app';
import type { Sprint } from '@shared/types/jira';
import { useCallback, useEffect, useState } from 'react';

const REFRESH_MS = 60_000;

export function useSprint(projectKey: string): { sprint: Fetched<Sprint> | null; refresh: () => void } {
  const [loaded, setLoaded] = useState<{ projectKey: string; sprint: Fetched<Sprint> } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const load = () => {
      void window.maple.jira.sprint(projectKey).then((sprint) => {
        if (live) {
          setLoaded({ projectKey, sprint });
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

  return { sprint: loaded?.projectKey === projectKey ? loaded.sprint : null, refresh };
}
