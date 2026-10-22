import type { CheckRun, ChecksSummary, PrInfo } from '@shared/types/github';
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
  test('shows the PR link and its sections', () => {
    // given
    const pr = fetched(info);
    // when
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.getByRole('link', { name: 'PR #33 [MPL-20] File Tree and PR Summary' })).toHaveAttribute(
      'href',
      info.url,
    );
    expect(screen.getByText('Used X instead of Y')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Try it on device',
      'MPL-21: rename foo to bar',
    ]);
  });

  test('opens the full description', async () => {
    // given
    const onOpenDescription = vi.fn();
    render(<PrSummary pr={fetched(info)} onOpenDescription={onOpenDescription} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Full description' }));
    // then
    expect(onOpenDescription).toHaveBeenCalledOnce();
  });

  test('renders section Markdown', () => {
    // given
    const pr = fetched({ ...info, needsTaylor: '- run `make run`\n- check the board', cardImpacts: null });
    // when
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
    // then
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['run make run', 'check the board']);
    expect(screen.getByText('make run').tagName).toBe('CODE');
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  test('shows None for null sections in order', () => {
    // given
    const pr = fetched({ ...info, deviations: null, needsTaylor: null, cardImpacts: null });
    // when
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
    // then
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Deviations from the card', 'Needs Taylor', 'Card impacts']);
    expect(screen.getAllByText('None')).toHaveLength(3);
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
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
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
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
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
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '✗ unit-test',
      '● e2e',
      '✓ format',
      'Try it on device',
      'MPL-21: rename foo to bar',
    ]);
  });

  test('shows no check list without check runs', () => {
    // given
    const pr = fetched({ ...info, checks: { ...info.checks, runs: [] } });
    // when
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Try it on device',
      'MPL-21: rename foo to bar',
    ]);
  });

  test('keeps the last data when GitHub is unreachable', () => {
    // given
    const pr = fetched(info, 'listing PRs: network down');
    // when
    render(<PrSummary pr={pr} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.getByText('GitHub unreachable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PR #33/ })).toBeInTheDocument();
  });

  test.each([
    { name: 'no PR yet', pr: fetched(null), unreachable: false },
    { name: 'an error before any data', pr: fetched(null, 'listing PRs: network down'), unreachable: true },
  ])('shows no PR details with $name', ({ pr, unreachable }) => {
    // given
    const input = pr;
    // when
    render(<PrSummary pr={input} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('GitHub unreachable') !== null).toBe(unreachable);
  });
});
