import { useEffect } from 'react';

export type QuickOpenMode = 'files' | 'text';

export function useQuickOpenKeys(onOpen: ((mode: QuickOpenMode) => void) | null) {
  useEffect(() => {
    if (onOpen === null) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }
      const key = e.key.toLowerCase();
      const mode = key === 'p' && !e.shiftKey ? 'files' : key === 'f' && e.shiftKey ? 'text' : null;
      if (mode === null) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onOpen(mode);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onOpen]);
}
