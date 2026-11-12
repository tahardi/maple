import { useState } from 'react';

const storageKey = (projectKey: string) => `maple.doneOpen.${projectKey}`;

function load(projectKey: string): boolean {
  try {
    return localStorage.getItem(storageKey(projectKey)) === 'true';
  } catch {
    return false;
  }
}

export function useDoneOpen(projectKey: string): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(() => load(projectKey));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey(projectKey), String(next));
    } catch {
      return;
    }
  };

  return { open, toggle };
}
