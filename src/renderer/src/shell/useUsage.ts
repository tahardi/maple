import { useEffect, useState } from 'react';
import type { Usage, UsageWindow } from '@shared/types';

function current(usage: Usage | null): Usage | null {
  const now = Date.now();
  const live = (w: UsageWindow | null) => (w && w.resetsAt * 1000 > now ? w : null);
  return usage && { fiveHour: live(usage.fiveHour), sevenDay: live(usage.sevenDay) };
}

export function useUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let pushed = false;
    void window.maple.app.usage().then((u) => {
      if (!pushed) {
        setUsage(current(u));
      }
    });
    return window.maple.app.onUsage((u) => {
      pushed = true;
      setUsage(current(u));
    });
  }, []);

  useEffect(() => {
    const resets = [usage?.fiveHour, usage?.sevenDay].flatMap((w) => (w ? [w.resetsAt * 1000] : []));
    if (resets.length === 0) {
      return;
    }
    const timer = setTimeout(
      () => {
        setUsage(current(usage));
      },
      Math.min(...resets) - Date.now(),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [usage]);

  return usage;
}
