import type { BacklogGroup } from '@shared/types';
import { render, screen } from '@testing-library/react';
import { card } from '../testing/sprintFixture';
import { Backlog } from './Backlog';

const GROUPS: BacklogGroup[] = [
  { epic: { key: 'HALO-2', summary: 'Search' }, cards: [card('HALO-11', 'To Do'), card('HALO-13', 'To Do')] },
  { epic: null, cards: [card('HALO-19', 'To Do', { points: null })] },
];

describe('Backlog', () => {
  test('shows the card count and groups cards under each epic', () => {
    // given
    render(<Backlog groups={GROUPS} />);
    // when
    const headings = screen.getAllByRole('heading', { level: 3, hidden: true });
    // then
    expect(screen.getByText('Backlog (3)')).toBeInTheDocument();
    expect(headings.map((h) => h.textContent)).toEqual(['HALO-2 Search', 'No epic']);
  });

  test('each card shows key, summary, and points', () => {
    // given
    render(<Backlog groups={GROUPS} />);
    // when
    const items = screen.getAllByRole('listitem', { hidden: true });
    // then
    expect(items.map((i) => i.textContent)).toEqual([
      'HALO-11Summary of HALO-113 pts',
      'HALO-13Summary of HALO-133 pts',
      'HALO-19Summary of HALO-19',
    ]);
  });

  test('shows nothing to plan when the backlog is empty', () => {
    // given
    render(<Backlog groups={[]} />);
    // when
    const summary = screen.getByText('Backlog (0)');
    // then
    expect(summary).toBeInTheDocument();
    expect(screen.getByText('Nothing in the backlog')).toBeInTheDocument();
  });
});
