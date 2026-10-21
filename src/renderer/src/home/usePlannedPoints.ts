import { sprintPoints } from '@shared/points';
import type { ProjectPoints } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';
import { useMaple } from '../store';

export function usePlannedPoints(): { rows: readonly ProjectPoints[]; refresh: () => void } {
  const projects = useMaple((s) => s.config?.data?.projects);
  const [rows, setRows] = useState<readonly ProjectPoints[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projects) {
      return;
    }
    let live = true;
    const load = () => {
      void Promise.all(
        projects.map(async ({ jiraKey, name }) => {
          const sprint = await window.maple.jira.sprint(jiraKey);
          return { projectKey: jiraKey, name, ...sprintPoints(sprint.data?.cards ?? []) };
        }),
      ).then((loaded) => {
        if (live) {
          setRows(loaded);
        }
      });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      live = false;
      window.removeEventListener('focus', load);
    };
  }, [projects, tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { rows: projects ? rows : [], refresh };
}
