import type { Review } from '@shared/types/github/review';
import { errorText } from '@shared/errors/errorText';
import { useState } from 'react';
import { useWorktreeState } from '../useWorktreeState';
import { approveConfirm } from './approveConfirm';

export type ApproveFlow = {
  error: string | null;
  approving: boolean;
  dialog: { title: string; body: string; danger: boolean } | null;
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
  const [pendingSha, setPendingSha] = useState<string | null>(null);
  const [merging, setMerging] = useState<ReadonlySet<string | null>>(new Set());
  const headSha = review?.headSha ?? null;
  const asking = review !== null && pendingSha === headSha;
  const highFindings = review?.findings.filter((f) => f.severity === 'high').length ?? 0;

  const send = (sha: string) => {
    setError(() => null);
    const path = worktreePath;
    setMerging((now) => new Set(now).add(path));
    window.maple.pr
      .approve(tabId, sha)
      .catch((err: unknown) => {
        setError(() => ({ headSha: sha, message: errorText(err) }));
      })
      .finally(() => {
        setMerging((now) => {
          const next = new Set(now);
          next.delete(path);
          return next;
        });
      });
  };

  return {
    error: error !== null && error.headSha === headSha ? error.message : null,
    approving: merging.has(worktreePath),
    dialog: asking ? approveConfirm({ number: review.number, highFindings, unviewed }) : null,
    approve: () => {
      setPendingSha(headSha);
    },
    confirm: () => {
      setPendingSha(null);
      if (asking) {
        send(review.headSha);
      }
    },
    cancel: () => {
      setPendingSha(null);
    },
    clearError: () => {
      setError(() => null);
    },
  };
}
