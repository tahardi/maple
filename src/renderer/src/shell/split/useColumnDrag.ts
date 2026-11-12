import { useState, type RefObject } from 'react';

type ColumnDragOptions = {
  storageKey: string;
  initial: number;
  toSize: (rect: DOMRect, pointer: PointerEvent) => number;
};

export type ColumnDrag = { size: number; start: (e: { preventDefault: () => void }) => void; reset: () => void };

function load(storageKey: string, initial: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    const saved = raw === null ? NaN : Number(raw);
    return Number.isFinite(saved) ? saved : initial;
  } catch {
    return initial;
  }
}

export function useColumnDrag(container: RefObject<HTMLElement | null>, options: ColumnDragOptions): ColumnDrag {
  const { storageKey, initial, toSize } = options;
  const [size, setSize] = useState(() => load(storageKey, initial));

  const start = (e: { preventDefault: () => void }) => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    e.preventDefault();
    let last: number | null = null;
    const move = (ev: PointerEvent) => {
      last = toSize(rect, ev);
      setSize(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (last === null) {
        return;
      }
      try {
        localStorage.setItem(storageKey, String(last));
      } catch {
        return;
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const reset = () => {
    setSize(initial);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      return;
    }
  };

  return { size, start, reset };
}
