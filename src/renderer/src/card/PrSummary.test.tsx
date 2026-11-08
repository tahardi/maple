import type { CheckRun, ChecksSummary, PrInfo, SecurityFinding } from '@shared/types/github';
import type { Fetched } from '@shared/types/app';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrSummary } from './PrSummary';

const info: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-20] File Tree and PR Summary',
  state: 'OPEN',
  deviations: 'Used X instead of Y',
  needsTaylor: '- Try it on device',
  cardImpacts: '- MPL-21: rename foo to bar',
  body: '',
  checks: { passed: 5, failed: 0, pending: 0, total: 5, runs: [] },
};

const fetched = (data: PrInfo | null, error: string | null = null): Fetched<PrInfo> => ({
  data,
  error,
  fetchedAt: '2026-10-18T12:00:00.000Z',
});

describe('PrSummary', () => {
  test('leaves out the PR title and description sections', () => {
    // given
    const pr = fetched(info);
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.queryByText(info.title)).toBeNull();
    expect(screen.queryByText('Used X instead of Y')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Needs Taylor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Full description' })).toBeNull();
  });

  test.each([
    { name: 'a PR in the project repo', url: info.url, projectRepo: 'tahardi/maple', label: 'PR #33' },
    {
      name: 'a PR in another repo',
      url: 'https://github.com/tahardi/dotclaude/pull/33',
      projectRepo: 'tahardi/maple',
      label: 'tahardi/dotclaude PR #33',
    },
    { name: 'a PR when the project repo is unknown', url: info.url, projectRepo: null, label: 'PR #33' },
  ])('labels $name', ({ url, projectRepo, label }) => {
    // given
    const pr = fetched({ ...info, url });
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo={projectRepo}
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  test.each<{ state: PrInfo['state']; label: string }>([
    { state: 'OPEN', label: 'Open' },
    { state: 'MERGED', label: 'Merged' },
    { state: 'CLOSED', label: 'Closed' },
  ])('shows a $state PR as $label', ({ state, label }) => {
    // given
    const pr = fetched({ ...info, state });
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByText(label)).toHaveAttribute('data-state', state);
  });

  test('shows the checks under a Checks heading', () => {
    // given
    const pr = fetched(info);
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByRole('heading', { name: 'Checks' })).toBeInTheDocument();
  });

  test('the PR number opens the PR description', async () => {
    // given
    const onOpenDescription = vi.fn();
    render(
      <PrSummary
        pr={fetched(info)}
        onOpenDescription={onOpenDescription}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'PR #33' }));
    // then
    expect(onOpenDescription).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'PR #33' })).toHaveAttribute('title', 'Open PR description');
  });

  test.each<{ checks: ChecksSummary; text: string }>([
    { checks: { passed: 5, failed: 0, pending: 0, total: 5, runs: [] }, text: '✓ 5/5' },
    { checks: { passed: 4, failed: 1, pending: 0, total: 5, runs: [] }, text: '✗ 1 failing' },
    { checks: { passed: 3, failed: 0, pending: 2, total: 5, runs: [] }, text: '● 2 pending' },
    { checks: { passed: 2, failed: 1, pending: 2, total: 5, runs: [] }, text: '✗ 1 failing' },
    { checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] }, text: '✓ 0/0' },
  ])('shows checks as $text', ({ checks, text }) => {
    // given
    const pr = fetched({ ...info, checks });
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test.each<{ bucket: CheckRun['bucket']; symbol: string }>([
    { bucket: 'pass', symbol: '✓' },
    { bucket: 'skipping', symbol: '–' },
    { bucket: 'fail', symbol: '✗' },
    { bucket: 'cancel', symbol: '✗' },
    { bucket: 'pending', symbol: '●' },
  ])('links a $bucket check run to its log with $symbol', ({ bucket, symbol }) => {
    // given
    const link = 'https://github.com/tahardi/maple/actions/runs/1/job/2';
    const pr = fetched({ ...info, checks: { ...info.checks, runs: [{ name: 'lint', bucket, link }] } });
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    const anchor = screen.getByRole('link', { name: 'lint' });
    expect(anchor).toHaveAttribute('href', link);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noreferrer');
    expect(anchor.closest('li')?.textContent).toBe(`${symbol} lint`);
  });

  test('lists check runs in gh order', () => {
    // given
    const jobs = 'https://github.com/tahardi/maple/actions/runs/1/job';
    const runs: CheckRun[] = [
      { name: 'unit-test', bucket: 'fail', link: `${jobs}/1` },
      { name: 'e2e', bucket: 'pending', link: `${jobs}/2` },
      { name: 'format', bucket: 'pass', link: `${jobs}/3` },
    ];
    const pr = fetched({ ...info, checks: { ...info.checks, runs } });
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['✗ unit-test', '● e2e', '✓ format']);
  });

  test('shows no check list without check runs', () => {
    // given
    const pr = fetched({ ...info, checks: { ...info.checks, runs: [] } });
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.queryAllByRole('list')).toHaveLength(0);
  });

  test('keeps the last data when GitHub is unreachable', () => {
    // given
    const pr = fetched(info, 'listing PRs: network down');
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByText('GitHub unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PR #33' })).toBeInTheDocument();
  });

  test.each([
    { name: 'no PR yet', pr: fetched(null), unreachable: false },
    { name: 'an error before any data', pr: fetched(null, 'listing PRs: network down'), unreachable: true },
  ])('shows no PR details with $name', ({ pr, unreachable }) => {
    // given
    const input = pr;
    // when
    render(
      <PrSummary
        pr={input}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('GitHub unreachable') !== null).toBe(unreachable);
  });

  test('names the searched repos when no PR is found', () => {
    // given
    const pr: Fetched<PrInfo> = { data: null, error: null, fetchedAt: '2026-10-18T12:00:00.000Z' };
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/xena"
        headSha={null}
        searchedRepos={['tahardi/xena', 'tahardi/dotclaude']}
      />,
    );
    // then
    expect(
      screen.getByText(
        'No PR found in tahardi/xena, tahardi/dotclaude. If it is in another repo, add that repo to otherRepos in ' +
          'config.json, then choose File > Reload config.',
      ),
    ).toBeInTheDocument();
  });

  test.each<{ name: string; pr: Fetched<PrInfo>; searchedRepos: readonly string[] }>([
    { name: 'no searched repos', pr: fetched(null), searchedRepos: [] },
    { name: 'a failed lookup', pr: fetched(null, 'boom'), searchedRepos: ['tahardi/xena'] },
    { name: 'no lookup yet', pr: { data: null, error: null, fetchedAt: null }, searchedRepos: ['tahardi/xena'] },
    { name: 'a PR', pr: fetched(info), searchedRepos: ['tahardi/xena'] },
  ])('shows no hint with $name', ({ pr, searchedRepos }) => {
    // given
    const input = pr;
    // when
    render(
      <PrSummary
        pr={input}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/xena"
        headSha={null}
        searchedRepos={searchedRepos}
      />,
    );
    // then
    expect(screen.queryByText(/No PR found/)).toBeNull();
  });

  test('lists open security findings as text', () => {
    // given
    const findings: SecurityFinding[] = [
      { id: 'F1', severity: 'high', summary: '<img src=x onerror=alert(1)>', url: 'https://github.com/x/1' },
      { id: 'F2', severity: 'low', summary: 'Wide permissions', url: 'https://github.com/x/2' },
    ];
    // when
    const { container } = render(
      <PrSummary
        pr={fetched(info)}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={findings}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByRole('heading', { name: 'Security findings' })).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('F1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wide permissions' })).toHaveAttribute('href', 'https://github.com/x/2');
  });

  test('shows no findings section when there are none', () => {
    // given
    const pr = fetched(info);
    // when
    render(
      <PrSummary
        pr={pr}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.queryByRole('heading', { name: 'Security findings' })).toBeNull();
  });

  test('shows the reviewed commit', () => {
    // given
    const headSha = '0123456789abcdef0123456789abcdef01234567';
    // when
    render(
      <PrSummary
        pr={fetched(info)}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={headSha}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByText('Reviewing 0123456')).toBeInTheDocument();
  });

  test('links a finding with no summary by its comment', () => {
    // given
    const findings: SecurityFinding[] = [{ id: 'F3', severity: 'medium', summary: '', url: 'https://github.com/x/3' }];
    // when
    render(
      <PrSummary
        pr={fetched(info)}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={null}
        findings={findings}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByText('F3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open comment' })).toHaveAttribute('href', 'https://github.com/x/3');
  });

  test('shows why the review failed to load', () => {
    // given
    const reviewError = 'fetching review: the PR head moved, try again';
    // when
    render(
      <PrSummary
        pr={fetched(info)}
        onOpenDescription={vi.fn()}
        onReloadReview={vi.fn()}
        reviewError={reviewError}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // then
    expect(screen.getByText(reviewError)).toBeInTheDocument();
  });

  test.each([
    { state: 'OPEN' as const, shown: true },
    { state: 'MERGED' as const, shown: false },
  ])('a $state PR shows a reload review button: $shown', async ({ state, shown }) => {
    // given
    const onReloadReview = vi.fn();
    render(
      <PrSummary
        pr={fetched({ ...info, state })}
        onOpenDescription={vi.fn()}
        onReloadReview={onReloadReview}
        reviewError={null}
        findings={[]}
        projectRepo="tahardi/maple"
        headSha={null}
        searchedRepos={[]}
      />,
    );
    // when
    const button = screen.queryByRole('button', { name: 'Reload review' });
    if (button !== null) {
      await userEvent.click(button);
    }
    // then
    expect(button !== null).toBe(shown);
    expect(onReloadReview).toHaveBeenCalledTimes(shown ? 1 : 0);
  });
});
