import type { Card } from '@shared/types/jira/card';
import type { ChangeSet } from '@shared/types/files/changeSet';
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
  checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] },
};

describe('CardHeader', () => {
  test('shows the card, status, PR link, branch, and change counts', () => {
    // given
    const props = {
      cardKey: 'MPL-20',
      card,
      pr,
      branch: 'mpl-20-file-tree',
      changes,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('MPL-20 File Tree and PR Summary')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'PR #33 ↗' });
    expect(link).toHaveAttribute('href', pr.url);
    expect(link).toHaveAttribute('title', 'Open on GitHub');
    expect(screen.getByText('mpl-20-file-tree')).toBeInTheDocument();
    expect(screen.getByText('3 files')).toBeInTheDocument();
    expect(screen.getByText('+68')).toBeInTheDocument();
    expect(screen.getByText('−29')).toBeInTheDocument();
  });

  test('shows the Jira status as a neutral badge', () => {
    // given
    const props = {
      cardKey: 'MPL-20',
      card,
      pr: null,
      branch: null,
      changes: null,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('In Progress')).toHaveAttribute('data-tone', 'neutral');
  });

  test.each([
    { name: 'the project repo', url: pr.url, want: 'PR #33 ↗' },
    { name: 'another repo', url: 'https://github.com/tahardi/dotclaude/pull/33', want: 'tahardi/dotclaude PR #33 ↗' },
  ])('names the PR link for a PR in $name', ({ url, want }) => {
    // given
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: { ...pr, url },
      branch: null,
      changes: null,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByRole('link', { name: want })).toHaveAttribute('href', url);
  });

  test.each([
    { count: 1, want: '1 file' },
    { count: 3, want: '3 files' },
  ])('counts $count changed files as "$want"', ({ count, want }) => {
    // given
    const files = Array.from({ length: count }, (_, i) => ({ ...changes.files[0], path: `${String(i)}.ts` }));
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: { ...changes, files },
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText(want)).toBeInTheDocument();
  });

  test('a long branch truncates and shows in full on hover', () => {
    // given
    const branch = 'mpl-20-a-very-long-branch-name-that-would-push-the-other-facts-off-screen';
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch,
      changes: null,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
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
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('+68').className).toMatch(/added/);
    expect(screen.getByText('−29').className).toMatch(/removed/);
  });

  test('shows zero added and removed line counts', () => {
    // given
    const empty = { ...changes, added: 0, removed: 0 };
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: empty,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
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
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: null,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    const { container } = render(<CardHeader {...props} />);
    // then
    expect(container).toHaveTextContent(/^MPL-20$/);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('the card title opens the card description', async () => {
    // given
    const onOpenCard = vi.fn();
    const props = {
      cardKey: 'MPL-20',
      card,
      pr: null,
      branch: null,
      changes: null,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard,
    };
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
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: null,
      cost: null,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
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
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: null,
      cost,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
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
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: null,
      cost: unpriced,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
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
    const props = {
      cardKey: 'MPL-20',
      card: null,
      pr: null,
      branch: null,
      changes: null,
      cost,
      projectRepo: 'tahardi/maple',
      onOpenCard: vi.fn(),
    };
    // when
    const { container } = render(<CardHeader {...props} />);
    // then
    expect(container.textContent).toBe(`MPL-20${want}`);
  });
});
