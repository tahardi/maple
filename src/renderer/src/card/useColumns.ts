import { useState } from 'react';

type Columns = { left: number; right: number };

const KEY = 'maple.columns';
const DEFAULT: Columns = { left: 240, right: 32 };

function load(): Columns {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object' && 'left' in saved && 'right' in saved) {
      const { left, right } = saved;
      if (typeof left === 'number' && typeof right === 'number') {
        return { left, right };
      }
    }
  } catch {
    return DEFAULT;
  }
  return DEFAULT;
}

export function useColumns(): [Columns, (columns: Columns) => void] {
  const [columns, setColumns] = useState(load);
  const save = (next: Columns) => {
    setColumns(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return;
    }
  };
  return [columns, save];
}
