import { saveState, type SavedState } from './state';

export type StateStore = { current: () => SavedState; patch: (change: Partial<SavedState>) => Promise<void> };

export function createStateStore(
  initial: SavedState,
  save: (state: SavedState) => Promise<void> = saveState,
): StateStore {
  let saved = initial;
  let saving = Promise.resolve();
  return {
    current: () => saved,
    patch: (change) => {
      saved = { ...saved, ...change };
      const snapshot = saved;
      saving = saving.catch(() => undefined).then(() => save(snapshot));
      return saving;
    },
  };
}
