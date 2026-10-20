import type { VaultNote } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';

type Vault = { notes: VaultNote[]; listedAt: number; refresh: () => void };

export function useVault(enabled: boolean): Vault {
  const [listing, setListing] = useState<{ notes: VaultNote[]; listedAt: number }>({ notes: [], listedAt: 0 });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    void window.maple.vault.list().then((next) => {
      if (live) {
        setListing({ notes: next, listedAt: Date.now() });
      }
    });
    return () => {
      live = false;
    };
  }, [enabled, version]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return { ...listing, refresh };
}
