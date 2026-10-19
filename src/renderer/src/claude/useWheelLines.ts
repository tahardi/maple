import { useState } from 'react';

const KEY = 'maple.wheelLines';
const DEFAULT = 3;

export function isWheelLines(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 20;
}

function load(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return isWheelLines(saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useWheelLines(): [number, (lines: number) => void] {
  const [lines, setLines] = useState(load);
  const save = (next: number) => {
    setLines(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      return;
    }
  };
  return [lines, save];
}
