import type { Dot } from '@shared/types/tabs/dot';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';

type ApproveBlockerInput = { dot: Dot; pr: PrInfo | null; review: Review | null; worktreeExists: boolean };

export function approveBlocker({ dot, pr, review, worktreeExists }: ApproveBlockerInput): string | null {
  if (!worktreeExists) {
    return 'No worktree';
  }
  if (dot === 'working') {
    return 'Agent is working';
  }
  if (pr?.state !== 'OPEN') {
    return 'No open PR';
  }
  if (pr.checks.failed > 0) {
    return 'Checks are failing';
  }
  if (review === null) {
    return 'Review not loaded';
  }
  return pr.headSha !== review.headSha ? 'PR has new commits' : null;
}
