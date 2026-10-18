import type { Card, ChangeSet, PrInfo } from '@shared/types';
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
    { path: 'a.ts', status: 'A', oldPath: null },
    { path: 'b.ts', status: 'M', oldPath: null },
    { path: 'c.ts', status: 'D', oldPath: null },
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
  checks: { passed: 0, failed: 0, pending: 0, total: 0 },
};

describe('CardHeader', () => {
  test('shows the card, status, PR link, branch, and change counts', () => {
    // given
    const props = { cardKey: 'MPL-20', card, pr, branch: 'mpl-20-file-tree', changes };
    // when
    render(<CardHeader {...props} />);
    // then
    expect(screen.getByText('MPL-20 File Tree and PR Summary')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#33 ↗' })).toHaveAttribute('href', pr.url);
    expect(screen.getByText('mpl-20-file-tree')).toBeInTheDocument();
    expect(screen.getByText('3 files · +68 −29')).toBeInTheDocument();
  });
});
