import { useState } from 'react';

export type DiffMode = 'in-file' | 'side-by-side';

const MODE_KEY = 'maple.viewMode';

function loadMode(): DiffMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'side-by-side' ? 'side-by-side' : 'in-file';
  } catch {
    return 'in-file';
  }
}

function saveMode(mode: DiffMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    return;
  }
}

export function useDiffMode(): { mode: DiffMode; choose: (mode: DiffMode) => void } {
  const [mode, setMode] = useState(loadMode);
  const choose = (next: DiffMode) => {
    setMode(next);
    saveMode(next);
  };
  return { mode, choose };
}
