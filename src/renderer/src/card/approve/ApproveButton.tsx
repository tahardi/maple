import { Button } from '@renderer/shell/blocks/Button';

type ApproveButtonProps = {
  blocker: string | null;
  busy: boolean;
  onClick: () => void;
  onReloadReview: () => void;
};

const STALE_REVIEW = new Set(['Review not loaded', 'PR has new commits']);

export function ApproveButton({ blocker, busy, onClick, onReloadReview }: ApproveButtonProps) {
  return (
    <Button
      label="Approve & merge"
      variant="primary"
      onClick={onClick}
      disabled={blocker !== null}
      reason={blocker}
      busy={busy}
      busyLabel="Merging…"
      fix={blocker !== null && STALE_REVIEW.has(blocker) ? { label: 'Reload review', onClick: onReloadReview } : null}
    />
  );
}
