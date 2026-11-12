import { fillAction } from '@shared/prompts/fillAction';
import type { Dot } from '@shared/types/tabs/dot';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
import type { PaneAction } from '@renderer/claude/ClaudePane';

type CardActionsInput = {
  config: MapleConfig;
  cardKey: string;
  pr: PrInfo | null;
  review: Review | null;
  dot: Dot;
  worktreeExists: boolean;
  approving: boolean;
  send: (text: string) => void;
  approve: () => void;
  reloadReview: () => void;
};

const STALE_REVIEW = new Set(['Review not loaded', 'PR has new commits']);

function approveBlocker({ dot, pr, review, worktreeExists }: CardActionsInput): string | null {
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

export function cardActions(input: CardActionsInput): PaneAction[] {
  const { config, cardKey, pr, worktreeExists, approving, send, approve, reloadReview } = input;
  const reason = approveBlocker(input);
  return [
    ...config.actions.map((action) => ({
      label: action.label,
      onClick: () => {
        send(fillAction(action.prompt, { key: cardKey, pr: pr?.number ?? null }));
      },
      ...(worktreeExists ? {} : { disabled: true }),
    })),
    {
      label: 'Approve & merge',
      onClick: approve,
      variant: 'primary',
      busy: approving,
      busyLabel: 'Merging…',
      ...(reason === null ? {} : { disabled: true, reason }),
      ...(reason !== null && STALE_REVIEW.has(reason)
        ? { fix: { label: 'Reload review', onClick: reloadReview } }
        : {}),
    },
  ];
}
