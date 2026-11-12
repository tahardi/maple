import type { Card } from '@shared/types/jira/card';
import type { ChangeSet } from '@shared/types/files/changeSet';
import type { Fetched } from '@shared/types/app/fetched';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { SessionCost } from '@shared/types/tabs/sessionCost';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardHeader } from './CardHeader';
import css from './CardHeader.module.css?raw';

const card: Card = {
  key: 'MPL-20',
  summary: 'File Tree and PR Summary',
  status: 'In Progress',
  points: 3,
  labels: [],
  blockedBy: [],
  epic: null,
  descriptionMd: '',
  url: 'https://example.atlassian.net/browse/MPL-20',
};

const changes: ChangeSet = {
  base: 'abc123',
  files: [
    { path: 'a.ts', status: 'A', oldPath: null, stamp: '1:1' },
    { path: 'b.ts', status: 'M', oldPath: null, stamp: '1:1' },
    { path: 'c.ts', status: 'D', oldPath: null, stamp: null },
  ],
  added: 68,
  removed: 29,
};

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
  checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] },
};

const fetched = (data: PrInfo | null, error: string | null = null): Fetched<PrInfo> => ({
  data,
  error,
  fetchedAt: '2026-10-18T12:00:00.000Z',
});

const base = {
  cardKey: 'MPL-20',
  card: null,
  pr: null,
  branch: null,
  changes: null,
  cost: null,
  projectRepo: 'tahardi/maple',
  onOpenCard: vi.fn(),
  searchedRepos: [],
  ci: null,
  onOpenPr: vi.fn(),
};

describe('CardHeader', () => {
  test('shows the card, status, PR link, branch, and change counts', () => {
    // given
    const props = { ...base, card, pr: fetched(pr), branch: 'mpl-20-file-tree', changes };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('MPL-20 File Tree and PR Summary')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PR #33' })).toHaveAttribute('title', 'Open PR description');
    const link = screen.getByRole('link', { name: '↗' });
    expect(link).toHaveAttribute('href', pr.url);
    expect(link).toHaveAttribute('title', 'Open on GitHub');
    expect(screen.getByText('mpl-20-file-tree')).toBeInTheDocument();
    expect(screen.getByText('3 files')).toBeInTheDocument();
    expect(screen.getByText('+68')).toBeInTheDocument();
    expect(screen.getByText('−29')).toBeInTheDocument();
  });

  test('shows the Jira status as a neutral badge', () => {
    // given
    const props = { ...base, card };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('In Progress')).toHaveAttribute('data-tone', 'neutral');
  });

  test.each([
    { name: 'the project repo', url: pr.url, want: 'PR #33' },
    { name: 'another repo', url: 'https://github.com/tahardi/dotclaude/pull/33', want: 'tahardi/dotclaude PR #33' },
  ])('names the PR button for a PR in $name', ({ url, want }) => {
    // given
    const props = { ...base, pr: fetched({ ...pr, url }) };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByRole('button', { name: want })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '↗' })).toHaveAttribute('href', url);
  });

  test.each([
    { count: 1, want: '1 file' },
    { count: 3, want: '3 files' },
  ])('counts $count changed files as "$want"', ({ count, want }) => {
    // given
    const files = Array.from({ length: count }, (_, i) => ({ ...changes.files[0], path: `${String(i)}.ts` }));
    const props = { ...base, changes: { ...changes, files } };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText(want)).toBeInTheDocument();
  });

  test('a long branch truncates and shows in full on hover', () => {
    // given
    const branch = 'mpl-20-a-very-long-branch-name-that-would-push-the-other-facts-off-screen';
    const props = { ...base, branch };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText(branch)).toHaveAttribute('title', branch);
    const branchRule = /\.branch \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(branchRule).toContain('max-width');
    expect(branchRule).toContain('text-overflow: ellipsis');
  });

  test('colors the added and removed line counts', () => {
    // given
    const props = { ...base, changes };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('+68').className).toMatch(/added/);
    expect(screen.getByText('−29').className).toMatch(/removed/);
  });

  test('shows zero added and removed line counts', () => {
    // given
    const empty = { ...changes, added: 0, removed: 0 };
    const props = { ...base, changes: empty };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.getByText('−0')).toBeInTheDocument();
  });

  test('the title stays bright and truncates as a button and as plain text', () => {
    // given
    const buttonRule = /button\.title \{[^}]*\}/.exec(css)?.[0] ?? '';
    // when
    const titleRule = /\.title \{[^}]*\}/.exec(css)?.[0] ?? '';
    // then
    expect(titleRule).toContain('color: var(--text-strong)');
    expect(titleRule).toContain('text-overflow: ellipsis');
    expect(buttonRule).not.toMatch(/\bcolor:/);
  });

  test('shows only the card key before anything loads', () => {
    // given
    const props = { ...base };
    // when
    const { container } = render(<CardHeader {...props} />);
    // then
    expect(container).toHaveTextContent(/^MPL-20$/);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('the card title opens the card description', async () => {
    // given
    const onOpenCard = vi.fn();
    const props = { ...base, card, onOpenCard };
    render(<CardHeader {...props} />);
    const title = screen.getByRole('button', { name: 'MPL-20 File Tree and PR Summary' });
    // when
    await userEvent.click(title);
    // then
    expect(onOpenCard).toHaveBeenCalledOnce();
    expect(title).toHaveAttribute('title', 'MPL-20 File Tree and PR Summary\nClick to open the card description');
  });

  test('the card key is plain text before the card loads', () => {
    // given
    const props = { ...base };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.queryByRole('button')).toBeNull();
  });

  const cost: SessionCost = {
    inputTokens: 1200,
    outputTokens: 34000,
    cacheWriteTokens: 200000,
    cacheReadTokens: 1000000,
    dollars: 3.4,
  };

  test('the cost tooltip breaks the tokens down', () => {
    // given
    const props = { ...base, cost };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('1.2M tokens · $3.40')).toHaveAttribute(
      'title',
      'Input 1.2K · Output 34K · Cache write 200K · Cache read 1M',
    );
    expect(screen.getByText('1.2M tokens · $3.40').className).toMatch(/cost/);
  });

  test('the cost tooltip stays when dollars are unknown', () => {
    // given
    const unpriced = { ...cost, dollars: null };
    const props = { ...base, cost: unpriced };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('1.2M tokens')).toHaveAttribute(
      'title',
      'Input 1.2K · Output 34K · Cache write 200K · Cache read 1M',
    );
  });

  test.each([
    { name: 'tokens and dollars', cost, want: '1.2M tokens · $3.40' },
    { name: 'tokens only when dollars are unknown', cost: { ...cost, dollars: null }, want: '1.2M tokens' },
    { name: 'nothing without a cost', cost: null, want: '' },
  ])('shows $name', ({ cost, want }) => {
    // given
    const props = { ...base, cost };
    // when
    const { container } = render(<CardHeader {...props} />);
    // then
    expect(container.textContent).toBe(`MPL-20${want}`);
  });

  test('the PR number opens the PR description', async () => {
    // given
    const onOpenPr = vi.fn();
    render(<CardHeader {...base} pr={fetched(pr)} onOpenPr={onOpenPr} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'PR #33' }));
    // then
    expect(onOpenPr).toHaveBeenCalledOnce();
  });

  test('shows the CI badge after the PR number', () => {
    // given
    const ci = <span data-testid="ci">CI</span>;
    // when
    render(<CardHeader {...base} pr={fetched(pr)} ci={ci} />);
    // then
    expect(screen.getByRole('link', { name: '↗' }).nextElementSibling).toBe(screen.getByTestId('ci'));
    expect(screen.getByRole('button', { name: 'PR #33' }).nextElementSibling).toBe(
      screen.getByRole('link', { name: '↗' }),
    );
  });

  test.each([
    { name: 'before any data', pr: fetched(null, 'listing PRs: network down'), button: false },
    { name: 'with the last data', pr: fetched(pr, 'listing PRs: network down'), button: true },
  ])('shows GitHub unreachable when the PR fetch fails $name', ({ pr: input, button }) => {
    // given
    const props = { ...base, pr: input, ci: <span data-testid="ci">CI</span> };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('GitHub unreachable')).toHaveAttribute('data-tone', 'danger');
    expect(screen.queryByRole('link', { name: '↗' })?.getAttribute('href') ?? null).toBe(button ? pr.url : null);
    expect(screen.queryByRole('button', { name: 'PR #33' }) !== null).toBe(button);
    expect(screen.queryByTestId('ci') !== null).toBe(button);
  });

  test('names the searched repos when no PR is found', () => {
    // given
    const props = { ...base, pr: fetched(null), searchedRepos: ['tahardi/xena', 'tahardi/dotclaude'] };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('No PR in tahardi/xena, tahardi/dotclaude')).toHaveAttribute(
      'title',
      'If the PR is in another repo, add that repo to otherRepos in config.json, then choose File > Reload config.',
    );
  });

  test.each<{ name: string; pr: Fetched<PrInfo>; searchedRepos: readonly string[] }>([
    { name: 'no repos searched', pr: fetched(null), searchedRepos: [] },
    { name: 'not fetched yet', pr: { data: null, error: null, fetchedAt: null }, searchedRepos: ['tahardi/xena'] },
    { name: 'fetch error', pr: fetched(null, 'boom'), searchedRepos: ['tahardi/xena'] },
  ])('shows no hint when $name', ({ pr: input, searchedRepos }) => {
    // given
    const props = { ...base, pr: input, searchedRepos };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.queryByText(/No PR in/)).toBeNull();
  });
});
