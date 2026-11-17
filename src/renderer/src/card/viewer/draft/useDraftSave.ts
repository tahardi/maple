import { errorText } from '@shared/errors/errorText';
import { useState } from 'react';
import { useMaple } from '@renderer/store';

export function useDraftSave(tabId: string): {
  saveError: { path: string; message: string } | null;
  persist: (path: string, write: Promise<void>, saved: () => void) => void;
} {
  const setDraft = useMaple((s) => s.setDraft);
  const [saveError, setSaveError] = useState<{ path: string; message: string } | null>(null);

  const persist = (path: string, write: Promise<void>, saved: () => void) => {
    setSaveError(null);
    write.then(
      () => {
        saved();
        setDraft(tabId, path, null);
      },
      (err: unknown) => {
        setSaveError({ path, message: errorText(err) });
      },
    );
  };

  return { saveError, persist };
}
