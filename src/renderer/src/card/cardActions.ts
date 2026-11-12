import { fillAction } from '@shared/prompts/fillAction';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { PaneAction } from '@renderer/claude/ClaudePane';

type CardActionsInput = {
  config: MapleConfig;
  cardKey: string;
  pr: PrInfo | null;
  worktreeExists: boolean;
  send: (text: string) => void;
};

export function cardActions({ config, cardKey, pr, worktreeExists, send }: CardActionsInput): PaneAction[] {
  return config.actions.map((action) => ({
    label: action.label,
    onClick: () => {
      send(fillAction(action.prompt, { key: cardKey, pr: pr?.number ?? null }));
    },
    ...(worktreeExists ? {} : { disabled: true }),
  }));
}
