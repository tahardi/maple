import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { card, SPRINT } from '../testing/sprintFixture';
import { Board } from './Board';

describe('Board', () => {
  test.each([
    { column: 'To Do', keys: ['DIG-41'] },
    { column: 'In Progress', keys: ['DIG-44'] },
    { column: 'In Review', keys: ['DIG-45'] },
    { column: 'Done', keys: ['DIG-40', 'DIG-39'] },
  ])('puts $keys in the $column column', ({ column, keys }) => {
    // given
    render(<Board sprint={SPRINT} highlighted={new Set()} onSelect={vi.fn()} />);
    // when
    const tiles = within(screen.getByRole('region', { name: column })).getAllByRole('button');
    // then
    expect(tiles.map((t) => t.dataset.key)).toEqual(keys);
  });

  test('fades a card blocked by an unfinished card', () => {
    // given
    render(<Board sprint={SPRINT} highlighted={new Set()} onSelect={vi.fn()} />);
    // when
    const blocked = screen.getByRole('button', { name: /^DIG-41/ });
    const doneBlocker = screen.getByRole('button', { name: /^DIG-45/ });
    // then
    expect(blocked).toHaveAttribute('data-blocked', 'true');
    expect(blocked).toHaveTextContent('blocked by DIG-44');
    expect(doneBlocker).not.toHaveAttribute('data-blocked');
  });

  test('lists every unfinished blocker', () => {
    // given
    const sprint = {
      ...SPRINT,
      cards: [
        card('DIG-50', 'To Do', {
          blockedBy: [
            { key: 'DIG-44', status: 'In Progress' as const },
            { key: 'DIG-40', status: 'Done' as const },
            { key: 'DIG-41', status: 'To Do' as const },
          ],
        }),
      ],
    };
    // when
    render(<Board sprint={sprint} highlighted={new Set()} onSelect={vi.fn()} />);
    // then
    expect(screen.getByRole('button', { name: /^DIG-50/ })).toHaveTextContent('blocked by DIG-44, DIG-41');
  });

  test('shows the sprint name, dates, and done count', () => {
    // given
    render(<Board sprint={SPRINT} highlighted={new Set()} onSelect={vi.fn()} />);
    // when
    const header = screen.getByRole('banner');
    // then
    expect(header).toHaveTextContent('DIG Sprint 3');
    expect(header).toHaveTextContent('Oct 12 – Oct 25');
    expect(header).toHaveTextContent('2 of 5 done');
  });

  test('tiles show key, summary, points, and labels', () => {
    // given
    render(<Board sprint={SPRINT} highlighted={new Set()} onSelect={vi.fn()} />);
    // when
    const tile = screen.getByRole('button', { name: /^DIG-44/ });
    // then
    expect(tile).toHaveTextContent('DIG-44');
    expect(tile).toHaveTextContent('Summary of DIG-44');
    expect(tile).toHaveTextContent('3 pts');
    expect(tile).toHaveTextContent('parallelizable');
  });

  test('hides points and labels a card does not have', () => {
    // given
    render(<Board sprint={SPRINT} highlighted={new Set()} onSelect={vi.fn()} />);
    // when
    const tile = screen.getByRole('button', { name: /^DIG-39/ });
    // then
    expect(tile).toHaveTextContent(/^DIG-39Summary of DIG-39$/);
  });

  test('marks highlighted cards and selects a card on click', async () => {
    // given
    const onSelect = vi.fn();
    render(<Board sprint={SPRINT} highlighted={new Set(['DIG-41'])} onSelect={onSelect} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: /^DIG-44/ }));
    // then
    expect(screen.getByRole('button', { name: /^DIG-41/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-44/ })).not.toHaveAttribute('data-highlighted');
    expect(onSelect).toHaveBeenCalledWith('DIG-44');
  });
});
