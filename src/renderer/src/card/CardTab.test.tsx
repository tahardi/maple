import type { PrInfo, TabState } from '@shared/types';
import { render, screen } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { CardTab } from './CardTab';

const tab: TabState = {
  id: 't1',
  projectKey: 'MPL',
  kind: 'card',
  cardKey: 'MPL-20',
  sessionId: 's1',
  worktreePath: '/home/me/wts/maple-mpl-20-file-tree/',
};

const pr: PrInfo = {
  number: 13,
  url: 'https://github.com/tahardi/maple/pull/13',
  title: '[MPL-20] File Tree and PR Summary',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  checks: { passed: 4, failed: 0, pending: 0, total: 4 },
};

function fakeRepo(withPr: boolean) {
  fakeMaple({
    repo: {
      changes: () =>
        Promise.resolve({
          base: 'abc',
          files: [{ path: 'src/a.ts', status: 'M', oldPath: null }],
          added: 1,
          removed: 0,
        }),
      listFiles: () => Promise.resolve(['README.md', 'src/a.ts']),
    },
    pr: { get: () => Promise.resolve({ data: withPr ? pr : null, error: null, fetchedAt: null }) },
  });
}

describe('CardTab', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    localStorage.clear();
  });

  test('shows the waiting text in the tree and viewer without a worktree', async () => {
    // given
    fakeMaple();
    // when
    render(<CardTab tab={{ ...tab, worktreePath: null }} />);
    // then
    expect(await screen.findAllByText('Waiting for worktree…')).toHaveLength(2);
    expect(screen.getByTestId('viewer-slot')).toHaveTextContent('Waiting for worktree…');
    expect(screen.queryByRole('button', { name: 'All files' })).not.toBeInTheDocument();
  });

  test.each([
    { name: 'All before a PR exists', withPr: false, pressed: 'All files' },
    { name: 'Changed once a PR exists', withPr: true, pressed: 'Changed (1)' },
  ])('defaults the toggle to $name', async ({ withPr, pressed }) => {
    // given
    fakeRepo(withPr);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByRole('button', { name: pressed, pressed: true })).toBeInTheDocument();
  });

  test('shows the branch from the worktree folder name', async () => {
    // given
    fakeRepo(true);
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(await screen.findByText('mpl-20-file-tree')).toBeInTheDocument();
  });

  test('uses saved column widths', () => {
    // given
    fakeMaple();
    localStorage.setItem('maple.columns', '{"left":300,"right":40}');
    // when
    render(<CardTab tab={tab} />);
    // then
    expect(screen.getByTestId('claude-slot')).toHaveStyle({ width: '40%' });
    expect(screen.getByTestId('viewer-slot').previousElementSibling?.previousElementSibling).toHaveStyle({
      width: '300px',
    });
  });
});
