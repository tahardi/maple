import type { ChecksSummary, Fetched, PrInfo } from '@shared/types';
import { render, screen } from '@testing-library/react';
import { PrSummary } from './PrSummary';

const info: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-20] File Tree and PR Summary',
  state: 'OPEN',
  deviations: 'Used X instead of Y',
  needsTaylor: '- Try it on device',
  cardImpacts: '- MPL-21: rename foo to bar',
  checks: { passed: 5, failed: 0, pending: 0, total: 5 },
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
    render(<PrSummary pr={pr} />);
    // then
    expect(screen.getByRole('link', { name: 'PR #33 [MPL-20] File Tree and PR Summary' })).toHaveAttribute(
      'href',
      info.url,
    );
    expect(screen.getByText('Used X instead of Y')).toBeInTheDocument();
    expect(screen.getByText('- Try it on device')).toBeInTheDocument();
    expect(screen.getByText('- MPL-21: rename foo to bar')).toBeInTheDocument();
  });

  test('shows None for null sections in order', () => {
    // given
    const pr = fetched({ ...info, deviations: null, needsTaylor: null, cardImpacts: null });
    // when
    render(<PrSummary pr={pr} />);
    // then
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Deviations from the card', 'Needs Taylor', 'Card impacts']);
    expect(screen.getAllByText('None')).toHaveLength(3);
  });

  test.each<{ checks: ChecksSummary; text: string }>([
    { checks: { passed: 5, failed: 0, pending: 0, total: 5 }, text: '✓ 5/5' },
    { checks: { passed: 4, failed: 1, pending: 0, total: 5 }, text: '✗ 1 failing' },
    { checks: { passed: 3, failed: 0, pending: 2, total: 5 }, text: '● 2 pending' },
  ])('shows checks as $text', ({ checks, text }) => {
    // given
    const pr = fetched({ ...info, checks });
    // when
    render(<PrSummary pr={pr} />);
    // then
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('keeps the last data when GitHub is unreachable', () => {
    // given
    const pr = fetched(info, 'listing PRs: network down');
    // when
    render(<PrSummary pr={pr} />);
    // then
    expect(screen.getByText('GitHub unreachable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PR #33/ })).toBeInTheDocument();
  });
});
