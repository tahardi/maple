import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { useEffect, useState } from 'react';
import { errorText } from '@shared/errors/errorText';

const EMPTY: Fetched<FindingsFile> = { data: null, error: null, fetchedAt: null };

export function useFindings(tabId: string): Fetched<FindingsFile> {
  const [findings, setFindings] = useState<Fetched<FindingsFile>>(EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      window.maple.findings.onChanged(() => {
        setVersion((v) => v + 1);
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    window.maple.findings.get(tabId).then(
      (result) => {
        if (live) {
          setFindings(result);
        }
      },
      (err: unknown) => {
        if (live) {
          setFindings({ data: null, error: errorText(err), fetchedAt: null });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [tabId, version]);

  return findings;
}
