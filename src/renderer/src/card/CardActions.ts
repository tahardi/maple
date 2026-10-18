import { fillAction } from '@shared/prompts';
import type { Dot, MapleConfig, PrInfo } from '@shared/types';
import type { PaneAction } from '../claude/ClaudePane';

type CardActionsInput = {
  config: MapleConfig;
  cardKey: string;
  pr: PrInfo | null;
  dot: Dot;
  worktreeExists: boolean;
  send: (text: string) => void;
  approve: () => void;
};

function approveBlocker({ dot, pr }: CardActionsInput): string | null {
  if (dot === 'working') {
    return 'Agent is working';
  }
  if (pr?.state !== 'OPEN') {
    return 'No open PR';
  }
  return pr.checks.failed > 0 ? 'Checks are failing' : null;
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
    { label: 'Approve', onClick: approve, ...disable(approveBlocker(input)) },
  ];
}
