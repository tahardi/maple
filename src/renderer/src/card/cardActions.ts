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
  send: (text: string) => void;
  approve: () => void;
};

function approveBlocker({ dot, pr, review }: CardActionsInput): string | null {
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
  const { config, cardKey, pr, worktreeExists, send, approve } = input;
  const disable = (title: string | null) =>
    !worktreeExists ? { disabled: true, title: 'No worktree' } : title === null ? {} : { disabled: true, title };
  return [
    ...config.actions.map((action) => ({
      label: action.label,
      onClick: () => {
        send(fillAction(action.prompt, { key: cardKey, pr: pr?.number ?? null }));
      },
      ...disable(null),
    })),
    { label: 'Approve', onClick: approve, variant: 'primary', ...disable(approveBlocker(input)) },
  ];
}
