import type { Fetched, Sprint } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';

const REFRESH_MS = 60_000;

export function useSprint(projectKey: string): { sprint: Fetched<Sprint> | null; refresh: () => void } {
  const [sprint, setSprint] = useState<Fetched<Sprint> | null>(null);

  const refresh = useCallback(() => {
    void window.maple.jira.sprint(projectKey).then(setSprint);
  }, [projectKey]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { sprint, refresh };
}
