import type { Review } from '@shared/types/github/review';
import { errorText } from '@shared/errors/errorText';
import { useState } from 'react';
import { useWorktreeState } from './useWorktreeState';

type Pending = { step: 'findings' | 'unviewed'; headSha: string };

export type ApproveFlow = {
  error: string | null;
  approving: boolean;
  dialog: { title: string; body: string } | null;
  approve: () => void;
  confirm: () => void;
  cancel: () => void;
  clearError: () => void;
};

export function useApproveFlow(
  tabId: string,
  worktreePath: string | null,
  review: Review | null,
  unviewed: number,
): ApproveFlow {
  const [error, setError] = useWorktreeState<{ headSha: string; message: string } | null>(worktreePath, null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [approving, setApproving] = useState(false);
  const headSha = review?.headSha ?? null;
  const highFindings = review?.findings.filter((f) => f.severity === 'high').length ?? 0;
  const step = pending !== null && pending.headSha === headSha ? pending.step : null;

  const send = () => {
    if (headSha === null) {
      return;
    }
    setError(() => null);
    setApproving(true);
    window.maple.pr
      .approve(tabId, headSha)
      .catch((err: unknown) => {
        setError(() => ({ headSha, message: errorText(err) }));
      })
      .finally(() => {
        setApproving(false);
      });
  };

  const askViewed = () => {
    if (unviewed > 0 && headSha !== null) {
      setPending({ step: 'unviewed', headSha });
    } else {
      setPending(null);
      send();
    }
  };

  const findingNoun = highFindings === 1 ? 'finding' : 'findings';
  const dialog =
    step === 'findings'
      ? {
          title: 'Open security findings',
          body: `${String(highFindings)} open high-severity ${findingNoun}. Approve anyway?`,
        }
      : step === 'unviewed'
        ? {
            title: 'Unviewed files',
            body: `${String(unviewed)} changed ${unviewed === 1 ? 'file' : 'files'} not viewed. Approve anyway?`,
          }
        : null;

  return {
    error: error !== null && error.headSha === headSha ? error.message : null,
    approving,
    dialog,
    approve: () => {
      if (headSha === null) {
        return;
      }
      if (highFindings > 0) {
        setPending({ step: 'findings', headSha });
      } else {
        askViewed();
      }
    },
    confirm: () => {
      if (step === 'findings') {
        askViewed();
      } else if (step === 'unviewed') {
        setPending(null);
        send();
      }
    },
    cancel: () => {
      setPending(null);
    },
    clearError: () => {
      setError(() => null);
    },
  };
}
