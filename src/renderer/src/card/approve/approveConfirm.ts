type ApproveConfirmInput = { number: number; highFindings: number; unviewed: number };

type ApproveConfirm = { title: string; body: string; danger: boolean };

export function approveConfirm({ number, highFindings, unviewed }: ApproveConfirmInput): ApproveConfirm {
  const warnings = [
    ...(highFindings > 0
      ? [`${String(highFindings)} open high-severity ${highFindings === 1 ? 'finding' : 'findings'}.`]
      : []),
    ...(unviewed > 0 ? [`${String(unviewed)} changed ${unviewed === 1 ? 'file' : 'files'} not viewed.`] : []),
  ];
  return {
    title: `Approve & merge PR #${String(number)}?`,
    body: warnings.length > 0 ? warnings.join(' ') : `Approves PR #${String(number)} and merges it.`,
    danger: warnings.length > 0,
  };
}
