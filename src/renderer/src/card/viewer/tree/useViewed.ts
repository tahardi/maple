import type { FileChange } from '@shared/types/files';
import { useState } from 'react';

type Saved = Readonly<Record<string, string | null>>;

const storageKey = (cardKey: string) => `maple.viewed.${cardKey}`;

function load(cardKey: string): Saved {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(cardKey)) ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      return Object.fromEntries(
        Object.entries(saved).filter((entry): entry is [string, string | null] => {
          return typeof entry[1] === 'string' || entry[1] === null;
        }),
      );
    }
  } catch {
    return {};
  }
  return {};
}

export function useViewed(
  cardKey: string,
  files: readonly FileChange[],
  scope = '',
): { viewed: ReadonlySet<string>; toggle: (path: string) => void } {
  const [saved, setSaved] = useState(() => load(cardKey));
  const viewed = new Set(
    files
      .filter((file) => Object.hasOwn(saved, scope + file.path) && saved[scope + file.path] === file.stamp)
      .map((file) => file.path),
  );

  const toggle = (path: string) => {
    const rest = Object.fromEntries(Object.entries(saved).filter(([key]) => key !== scope + path));
    const stamp = files.find((file) => file.path === path)?.stamp ?? null;
    const next = viewed.has(path) ? rest : { ...rest, [scope + path]: stamp };
    setSaved(next);
    try {
      localStorage.setItem(storageKey(cardKey), JSON.stringify(next));
    } catch {
      return;
    }
  };

  return { viewed, toggle };
}
