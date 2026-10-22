import type { ChecksSummary, Fetched, PrInfo } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
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
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
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
    render(<PrSummary tabId="t1" pr={fetched(info)} onOpenDescription={onOpenDescription} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Full description' }));
    // then
    expect(onOpenDescription).toHaveBeenCalledOnce();
  });

  test('renders section Markdown', () => {
    // given
    const pr = fetched({ ...info, needsTaylor: '- run `make run`\n- check the board', cardImpacts: null });
    // when
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
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
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
    // then
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Deviations from the card', 'Needs Taylor', 'Card impacts']);
    expect(screen.getAllByText('None')).toHaveLength(3);
  });

  test.each<{ checks: ChecksSummary; text: string }>([
    { checks: { passed: 5, failed: 0, pending: 0, total: 5 }, text: '✓ 5/5' },
    { checks: { passed: 4, failed: 1, pending: 0, total: 5 }, text: '✗ 1 failing' },
    { checks: { passed: 3, failed: 0, pending: 2, total: 5 }, text: '● 2 pending' },
    { checks: { passed: 2, failed: 1, pending: 2, total: 5 }, text: '✗ 1 failing' },
    { checks: { passed: 0, failed: 0, pending: 0, total: 0 }, text: '✓ 0/0' },
  ])('shows checks as $text', ({ checks, text }) => {
    // given
    const pr = fetched({ ...info, checks });
    // when
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('keeps the last data when GitHub is unreachable', () => {
    // given
    const pr = fetched(info, 'listing PRs: network down');
    // when
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
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
    render(<PrSummary tabId="t1" pr={input} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('GitHub unreachable') !== null).toBe(unreachable);
  });

  test('Drop removes the impact from the PR', async () => {
    // given
    const dropImpact = vi.fn(() => Promise.resolve());
    fakeMaple({ pr: { dropImpact } });
    const pr = fetched({ ...info, cardImpacts: '- MPL-21: rename foo to bar\n- MPL-22: drop baz' });
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
    // when
    await userEvent.click(screen.getAllByRole('button', { name: 'Drop' })[0]);
    // then
    expect(dropImpact).toHaveBeenCalledWith('t1', '- MPL-21: rename foo to bar');
    expect(screen.queryByText('MPL-21: rename foo to bar')).not.toBeInTheDocument();
    expect(screen.getByText('MPL-22: drop baz')).toBeInTheDocument();
  });

  test('shows the error and keeps the impact when Drop fails', async () => {
    // given
    fakeMaple({ pr: { dropImpact: () => Promise.reject(new Error('dropping card impact: offline')) } });
    render(<PrSummary tabId="t1" pr={fetched(info)} onOpenDescription={vi.fn()} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Drop' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('dropping card impact: offline');
    expect(screen.getByText('MPL-21: rename foo to bar')).toBeInTheDocument();
  });

  test.each([
    { name: 'a merged PR', pr: fetched({ ...info, state: 'MERGED' }) },
    { name: 'a None section', pr: fetched({ ...info, cardImpacts: 'None' }) },
    { name: 'a missing section', pr: fetched({ ...info, cardImpacts: null }) },
  ])('shows no Drop buttons for $name', ({ pr }) => {
    // given
    const input = pr;
    // when
    render(<PrSummary tabId="t1" pr={input} onOpenDescription={vi.fn()} />);
    // then
    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument();
  });

  test('disables Drop while a drop is in flight', async () => {
    // given
    fakeMaple({ pr: { dropImpact: () => new Promise<void>(() => undefined) } });
    const pr = fetched({ ...info, cardImpacts: '- MPL-21: rename foo to bar\n- MPL-22: drop baz' });
    render(<PrSummary tabId="t1" pr={pr} onOpenDescription={vi.fn()} />);
    // when
    await userEvent.click(screen.getAllByRole('button', { name: 'Drop' })[0]);
    // then
    expect(screen.getAllByRole('button', { name: 'Drop' }).map((b) => b.hasAttribute('disabled'))).toEqual([
      true,
      true,
    ]);
  });

  test('shows None after dropping the last impact', async () => {
    // given
    fakeMaple();
    render(<PrSummary tabId="t1" pr={fetched({ ...info, needsTaylor: null })} onOpenDescription={vi.fn()} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Drop' }));
    // then
    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument();
    expect(screen.getAllByText('None')).toHaveLength(2);
  });
});
