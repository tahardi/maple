import { useState } from 'react';

type Stored<T> = { worktree: string | null; value: T };

function current<T>(stored: Stored<T>, worktreePath: string | null, initial: T): T {
  const switched = stored.worktree !== null && worktreePath !== null && stored.worktree !== worktreePath;
  return switched ? initial : stored.value;
}

export function useWorktreeState<T>(worktreePath: string | null, initial: T): [T, (update: (now: T) => T) => void] {
  const [stored, setStored] = useState<Stored<T>>({ worktree: worktreePath, value: initial });
  const set = (update: (now: T) => T) => {
    setStored((now) => ({
      worktree: worktreePath ?? now.worktree,
      value: update(current(now, worktreePath, initial)),
    }));
  };
  return [current(stored, worktreePath, initial), set];
}
