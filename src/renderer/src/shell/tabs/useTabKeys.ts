import { useEffect } from 'react';
import { useMaple } from '@renderer/store';
import { adjacentTab } from './adjacentTab';

export function useTabKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }
      const { tabs, projectKey, activeTabId, activate, closeTab } = useMaple.getState();
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        activate(adjacentTab(tabs, projectKey, activeTabId, e.shiftKey ? -1 : 1));
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        e.stopPropagation();
        const active = tabs.find((t) => t.id === activeTabId);
        if (active?.kind === 'card') {
          void closeTab(active.id, false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
