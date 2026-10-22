import type { Card } from '@shared/types/jira';
import type { ChangeSet } from '@shared/types/files';
import type { PrInfo } from '@shared/types/github';
import type { SessionCost } from '@shared/types/tabs';
import { render, screen } from '@testing-library/react';
import { CardHeader } from './CardHeader';

const card: Card = {
  key: 'MPL-20',
  summary: 'File Tree and PR Summary',
  status: 'In Progress',
  points: 3,
  labels: [],
  blockedBy: [],
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
  checks: { passed: 0, failed: 0, pending: 0, total: 0, runs: [] },
};

describe('CardHeader', () => {
  test('shows the card, status, PR link, branch, and change counts', () => {
    // given
    const props = { cardKey: 'MPL-20', card, pr, branch: 'mpl-20-file-tree', changes, cost: null };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('MPL-20 File Tree and PR Summary')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#33 ↗' })).toHaveAttribute('href', pr.url);
    expect(screen.getByText('mpl-20-file-tree')).toBeInTheDocument();
    expect(screen.getByText('3 files · +68 −29')).toBeInTheDocument();
  });

  test('shows only the card key before anything loads', () => {
    // given
    const props = { cardKey: 'MPL-20', card: null, pr: null, branch: null, changes: null, cost: null };
    // when
    const { container } = render(<CardHeader {...props} />);
    // then
    expect(container).toHaveTextContent(/^MPL-20$/);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  const cost: SessionCost = {
    inputTokens: 1200,
    outputTokens: 34000,
    cacheWriteTokens: 200000,
    cacheReadTokens: 1000000,
    dollars: 3.4,
  };

  test.each([
    { name: 'tokens and dollars', cost, want: '1.2M tokens · $3.40' },
    { name: 'tokens only when dollars are unknown', cost: { ...cost, dollars: null }, want: '1.2M tokens' },
    { name: 'nothing without a cost', cost: null, want: '' },
  ])('shows $name', ({ cost, want }) => {
    // given
    const props = { cardKey: 'MPL-20', card: null, pr: null, branch: null, changes: null, cost };
    // when
    const { container } = render(<CardHeader {...props} />);
    // then
    expect(container.textContent).toBe(`MPL-20${want}`);
  });
});
