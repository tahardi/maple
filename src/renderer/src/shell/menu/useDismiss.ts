import { useEffect, type RefObject } from 'react';

export function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    const onOutside = (e: Event) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) {
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('focusin', onOutside, true);
    window.addEventListener('blur', onDismiss);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('focusin', onOutside, true);
      window.removeEventListener('blur', onDismiss);
    };
  }, [root, open, onDismiss]);
}
