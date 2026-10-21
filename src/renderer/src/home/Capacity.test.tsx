import type { ProjectPoints } from '@shared/types';
import { render, screen } from '@testing-library/react';
import { Capacity } from './Capacity';

const ROWS: ProjectPoints[] = [
  { projectKey: 'HALO', name: 'Halo', planned: 21, merged: 8 },
  { projectKey: 'DIG', name: 'Dig Days', planned: 13, merged: 0 },
];

describe('Capacity', () => {
  test('shows planned and merged points per project', () => {
    // given
    render(<Capacity rows={ROWS} reviewPoints={30} />);
    // when
    const items = screen.getAllByRole('listitem');
    // then
    expect(items.map((i) => i.textContent)).toEqual(['Halo 21 planned, 8 merged', 'Dig Days 13 planned, 0 merged']);
  });

  test('shows the total against reviewPoints', () => {
    // given
    render(<Capacity rows={ROWS} reviewPoints={30} />);
    // when
    const total = screen.getByText('34 of 30 review points planned');
    // then
    expect(total).toBeInTheDocument();
  });

  test.each([
    { reviewPoints: 33, over: 'true' },
    { reviewPoints: 34, over: null },
    { reviewPoints: 40, over: null },
  ])('marks the total when it is over capacity ($reviewPoints)', ({ reviewPoints, over }) => {
    // given
    render(<Capacity rows={ROWS} reviewPoints={reviewPoints} />);
    // when
    const total = screen.getByText(`34 of ${String(reviewPoints)} review points planned`);
    // then
    expect(total.getAttribute('data-over')).toBe(over);
  });
});
