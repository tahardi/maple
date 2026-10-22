import type { VaultNote } from '@shared/types/files';
import { useCallback, useEffect, useState } from 'react';

type Listing = { notes: VaultNote[]; written: string[] };

export function useVault(tabId: string, enabled: boolean): Listing & { refresh: () => void } {
  const [listing, setListing] = useState<Listing>({ notes: [], written: [] });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    void Promise.all([window.maple.vault.list(), window.maple.vault.written(tabId)]).then(([notes, written]) => {
      if (live) {
        setListing({ notes, written });
      }
    });
    return () => {
      live = false;
    };
  }, [tabId, enabled, version]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return { ...listing, refresh };
}
