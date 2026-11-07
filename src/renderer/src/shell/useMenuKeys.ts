import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react';

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
}

export function useMenuKeys(
  menu: RefObject<HTMLElement | null>,
  open: boolean,
): (e: KeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement;
    const checked = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? menuItems(menu.current).at(0))?.focus();
    return () => {
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [menu, open]);

  return useCallback((e: KeyboardEvent<HTMLElement>) => {
    const items = menuItems(e.currentTarget);
    const index = items.findIndex((item) => item === document.activeElement);
    const next = new Map([
      ['ArrowDown', index + 1],
      ['ArrowUp', index - 1],
      ['Home', 0],
      ['End', items.length - 1],
    ]).get(e.key);
    if (next !== undefined) {
      e.preventDefault();
      items.at(next % items.length)?.focus();
    }
  }, []);
}
