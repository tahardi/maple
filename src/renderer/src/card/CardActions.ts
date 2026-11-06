import { fillAction } from '@shared/prompts';
import type { Dot } from '@shared/types/tabs';
import type { MapleConfig } from '@shared/types/config';
import type { PrInfo, Review } from '@shared/types/github';
import type { PaneAction } from '../claude/ClaudePane';

type CardActionsInput = {
  config: MapleConfig;
  cardKey: string;
  pr: PrInfo | null;
  review: Review | null;
  dot: Dot;
  worktreeExists: boolean;
  send: (text: string) => void;
  approve: () => void;
  close: () => void;
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
  return review === null ? 'Review not loaded' : null;
}

function closeBlocker({ dot, pr }: CardActionsInput): string | null {
  if (dot === 'working') {
    return 'Agent is working';
  }
  return pr?.state === 'MERGED' ? 'PR is merged' : null;
}

export function cardActions(input: CardActionsInput): PaneAction[] {
  const { config, cardKey, pr, worktreeExists, send, approve, close } = input;
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
    { label: 'Approve', onClick: approve, ...disable(approveBlocker(input)) },
    { label: 'Close', onClick: close, ...disable(closeBlocker(input)) },
  ];
}
