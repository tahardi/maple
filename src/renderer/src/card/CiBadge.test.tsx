import type { CheckRun, ChecksSummary } from '@shared/types/github/checksSummary';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { SecurityFinding } from '@shared/types/github/securityFinding';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CiBadge } from './CiBadge';

const pr: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-20] File Tree and PR Summary',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 5, failed: 0, pending: 0, total: 5, runs: [] },
};

const jobs = 'https://github.com/tahardi/maple/actions/runs/1/job';

type Props = Parameters<typeof CiBadge>[0];

function renderBadge(overrides: Partial<Props> = {}) {
  const props: Props = {
    pr,
    reviewedSha: null,
    updated: false,
    reviewError: null,
    findings: [],
    reloading: false,
    onReloadReview: vi.fn(),
    ...overrides,
  };
  return render(<CiBadge {...props} />);
}

async function openPopover() {
  await userEvent.click(screen.getByRole('button', { expanded: false }));
}

describe('CiBadge', () => {
  test.each<{ name: string; checks: ChecksSummary; text: string; tone: string }>([
    {
      name: 'failing',
      checks: { passed: 2, failed: 1, pending: 2, total: 5, runs: [] },
      text: '✗ 1 failing',
      tone: 'danger',
    },
    {
      name: 'pending',
      checks: { passed: 3, failed: 0, pending: 2, total: 5, runs: [] },
      text: '● 2 pending',
      tone: 'warning',
    },
    {
      name: 'all passed',
      checks: { passed: 5, failed: 0, pending: 0, total: 5, runs: [] },
      text: '✓ 5/5',
      tone: 'success',
    },
    {
      name: 'no checks',
      checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] },
      text: 'No checks',
      tone: 'neutral',
    },
  ])('shows $text for $name', ({ checks, text, tone }) => {
    // given
    const input = { ...pr, checks };
    // when
    renderBadge({ pr: input });
    // then
    expect(screen.getByText(text)).toHaveAttribute('data-tone', tone);
  });

  test('opens a popover naming the PR head commit', async () => {
    // given
    renderBadge();
    // when
    await openPopover();
    // then
    expect(screen.getByRole('dialog')).toHaveTextContent('Checks on aaaaaaa');
  });

  test('lists failed checks first and keeps gh order within a group', async () => {
    // given
    const runs: CheckRun[] = [
      { name: 'a', bucket: 'pass', link: `${jobs}/1` },
      { name: 'b', bucket: 'fail', link: `${jobs}/2` },
      { name: 'c', bucket: 'pending', link: `${jobs}/3` },
      { name: 'd', bucket: 'cancel', link: `${jobs}/4` },
      { name: 'e', bucket: 'fail', link: `${jobs}/5` },
    ];
    renderBadge({ pr: { ...pr, checks: { ...pr.checks, runs } } });
    // when
    await openPopover();
    // then
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['✗ b', '✗ e', '✗ d', '● c', '✓ a']);
  });

  test.each<{ bucket: CheckRun['bucket']; symbol: string }>([
    { bucket: 'pass', symbol: '✓' },
    { bucket: 'skipping', symbol: '–' },
    { bucket: 'fail', symbol: '✗' },
    { bucket: 'cancel', symbol: '✗' },
    { bucket: 'pending', symbol: '●' },
  ])('shows $symbol for a $bucket run', async ({ bucket, symbol }) => {
    // given
    const link = `${jobs}/2`;
    renderBadge({ pr: { ...pr, checks: { ...pr.checks, runs: [{ name: 'lint', bucket, link }] } } });
    // when
    await openPopover();
    // then
    const anchor = screen.getByRole('link', { name: 'lint' });
    expect(anchor).toHaveAttribute('href', link);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noreferrer');
    expect(anchor.closest('li')?.textContent).toBe(`${symbol} lint`);
  });

  test.each<{ name: string; updated: boolean; state: PrInfo['state']; want: string; other: string }>([
    {
      name: 'the review did not reload',
      updated: false,
      state: 'OPEN',
      want: 'Reviewing ddddddd',
      other: 'Updated to',
    },
    {
      name: 'the review reloaded itself',
      updated: true,
      state: 'OPEN',
      want: 'Updated to ddddddd',
      other: 'Reviewing',
    },
    { name: 'a merged PR reloaded', updated: true, state: 'MERGED', want: 'Reviewing ddddddd', other: 'Updated to' },
  ])('shows $want when $name', async ({ updated, state, want, other }) => {
    // given
    renderBadge({ pr: { ...pr, state }, reviewedSha: 'd'.repeat(40), updated });
    // when
    await openPopover();
    // then
    expect(screen.getByText(want)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(other))).toBeNull();
  });

  test('Reload review calls onReloadReview', async () => {
    // given
    const onReloadReview = vi.fn();
    renderBadge({ onReloadReview });
    await openPopover();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload review' }));
    // then
    expect(onReloadReview).toHaveBeenCalledOnce();
  });

  test('Reload review reads Reloading… and is disabled while reloading', async () => {
    // given
    renderBadge({ reloading: true });
    // when
    await openPopover();
    // then
    expect(screen.getByRole('button', { name: 'Reloading…' })).toBeDisabled();
  });

  test('says no checks ran when the PR has none', async () => {
    // given
    renderBadge({ pr: { ...pr, checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] } } });
    // when
    await openPopover();
    // then
    expect(screen.getByRole('dialog')).toHaveTextContent('No checks ran on this commit.');
    expect(screen.queryByRole('list')).toBeNull();
  });

  test('marks the badge expanded only while the popover is open', async () => {
    // given
    renderBadge();
    const badge = screen.getByTitle('Show CI checks');
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    // when
    await userEvent.click(badge);
    // then
    expect(badge).toHaveAttribute('aria-expanded', 'true');
  });

  test('a click inside the popover keeps it open', async () => {
    // given
    renderBadge();
    await openPopover();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload review' }));
    // then
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('shows no Reload review on a merged PR', async () => {
    // given
    renderBadge({ pr: { ...pr, state: 'MERGED' } });
    // when
    await openPopover();
    // then
    expect(screen.queryByRole('button', { name: 'Reload review' })).toBeNull();
  });

  test('shows why the review failed to load', async () => {
    // given
    const reviewError = 'fetching review: the PR head moved, try again';
    renderBadge({ reviewError });
    // when
    await openPopover();
    // then
    expect(screen.getByRole('alert')).toHaveTextContent(reviewError);
  });

  test('lists open security findings', async () => {
    // given
    const findings: SecurityFinding[] = [
      { id: 'F1', severity: 'high', summary: '<img src=x onerror=alert(1)>', url: 'https://github.com/x/1' },
      { id: 'F2', severity: 'low', summary: 'Wide permissions', url: 'https://github.com/x/2' },
    ];
    const { container } = renderBadge({ findings });
    // when
    await openPopover();
    // then
    expect(screen.getByRole('heading', { name: 'Security findings' })).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('F1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wide permissions' })).toHaveAttribute('href', 'https://github.com/x/2');
  });

  test('links a finding with no summary by its comment', async () => {
    // given
    const findings: SecurityFinding[] = [{ id: 'F3', severity: 'medium', summary: '', url: 'https://github.com/x/3' }];
    renderBadge({ findings });
    // when
    await openPopover();
    // then
    expect(screen.getByText('F3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open comment' })).toHaveAttribute('href', 'https://github.com/x/3');
  });

  const dismissals: { how: string; dismiss: () => Promise<void> }[] = [
    {
      how: 'Escape',
      dismiss: async () => {
        await userEvent.keyboard('{Escape}');
      },
    },
    {
      how: 'a second click on the badge',
      dismiss: async () => {
        await userEvent.click(screen.getByTitle('Show CI checks'));
      },
    },
    {
      how: 'an outside click',
      dismiss: async () => {
        await userEvent.click(document.body);
      },
    },
  ];

  test.each(dismissals)('closes on $how', async ({ dismiss }) => {
    // given
    renderBadge();
    await openPopover();
    // when
    await dismiss();
    // then
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
