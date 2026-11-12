import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { card, SPRINT } from '../testing/sprintFixture';
import { Board } from './Board';

const START = { openKeys: new Set<string>(), starting: new Set<string>(), onStart: vi.fn() };

describe('Board', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test.each([
    { column: 'To Do', keys: ['DIG-41'] },
    { column: 'In Progress', keys: ['DIG-44'] },
    { column: 'In Review', keys: ['DIG-45'] },
  ])('puts $keys in the $column column', ({ column, keys }) => {
    // given
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // when
    const tiles = within(screen.getByRole('region', { name: column }))
      .getAllByRole('button')
      .filter((b) => b.dataset.key !== undefined);
    // then
    expect(tiles.map((t) => t.dataset.key)).toEqual(keys);
  });

  test('every column header shows its card count', () => {
    // given
    // when
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // then
    const headings = ['To Do', 'In Progress', 'In Review', 'Done'].map(
      (column) => within(screen.getByRole('region', { name: column })).getByRole('heading').textContent,
    );
    expect(headings).toEqual(['To Do1', 'In Progress1', 'In Review1', 'Done2']);
  });

  test('Done starts collapsed with its count and expands on click', async () => {
    // given
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    const done = screen.getByRole('region', { name: 'Done' });
    const expand = within(done).getByRole('button');
    expect(expand).toHaveAccessibleName('Expand Done column');
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveTextContent(/^Done2$/);
    // when
    await userEvent.click(expand);
    // then
    const buttons = within(done).getAllByRole('button');
    expect(buttons.filter((b) => b.dataset.key !== undefined).map((b) => b.dataset.key)).toEqual(['DIG-40', 'DIG-39']);
    expect(within(done).getByRole('button', { name: 'Collapse Done column' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('Done stays open for the project after a remount', async () => {
    // given
    const { unmount } = render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Expand Done column' }));
    unmount();
    // when
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // then
    expect(screen.getByRole('button', { name: /^DIG-40/ })).toBeInTheDocument();
  });

  test('another project keeps its Done collapsed', () => {
    // given
    localStorage.setItem('maple.doneOpen.DIG', 'true');
    // when
    render(
      <Board projectKey="BEAR" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // then
    expect(screen.queryByRole('button', { name: /^DIG-40/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Done column' })).toBeInTheDocument();
  });

  test('Collapse hides the Done tiles again', async () => {
    // given
    localStorage.setItem('maple.doneOpen.DIG', 'true');
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Done column' }));
    // then
    expect(screen.queryByRole('button', { name: /^DIG-40/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Done column' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('only To Do tiles have checkboxes', async () => {
    // given
    const onToggle = vi.fn();
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={onToggle} {...START} />,
    );
    // when
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select DIG-41' }));
    // then
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Select DIG-41']);
    expect(onToggle).toHaveBeenCalledWith('DIG-41');
  });

  test('marks a card blocked by an unfinished card with an icon', () => {
    // given
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // when
    const blocked = screen.getByRole('button', { name: /^DIG-41/ });
    const doneBlocker = screen.getByRole('button', { name: /^DIG-45/ });
    // then
    expect(blocked).toHaveAttribute('data-blocked', 'true');
    expect(blocked).toHaveTextContent('⛔ Blocked by DIG-44');
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
    render(
      <Board projectKey="DIG" sprint={sprint} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // then
    expect(screen.getByRole('button', { name: /^DIG-50/ })).toHaveTextContent('⛔ Blocked by DIG-44, DIG-41');
  });

  test('shows the sprint name, dates, and done count', () => {
    // given
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // when
    const header = screen.getByRole('banner');
    // then
    expect(header).toHaveTextContent('DIG Sprint 3');
    expect(header).toHaveTextContent('Oct 12 – Oct 25');
    expect(header).toHaveTextContent('2 of 5 done');
  });

  test('tiles show key, summary, points, and labels', () => {
    // given
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
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
    localStorage.setItem('maple.doneOpen.DIG', 'true');
    render(
      <Board projectKey="DIG" sprint={SPRINT} selected={new Set()} onSelect={vi.fn()} onToggle={vi.fn()} {...START} />,
    );
    // when
    const tile = screen.getByRole('button', { name: /^DIG-39/ });
    // then
    expect(tile).toHaveTextContent(/^DIG-39Summary of DIG-39$/);
  });

  test('marks selected cards and selects a card on click', async () => {
    // given
    const onSelect = vi.fn();
    render(
      <Board
        projectKey="DIG"
        sprint={SPRINT}
        selected={new Set(['DIG-41'])}
        onSelect={onSelect}
        onToggle={vi.fn()}
        {...START}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: /^DIG-44/ }));
    // then
    expect(screen.getByRole('button', { name: /^DIG-41/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /^DIG-44/ })).not.toHaveAttribute('data-highlighted');
    expect(onSelect).toHaveBeenCalledWith('DIG-44');
  });

  test('only To Do tiles without an open tab offer Start', () => {
    // given
    const sprint = {
      ...SPRINT,
      cards: [
        card('DIG-41', 'To Do'),
        card('DIG-42', 'To Do'),
        card('DIG-43', 'To Do', { blockedBy: [{ key: 'DIG-44', status: 'In Progress' as const }] }),
        card('DIG-44', 'In Progress'),
      ],
    };
    // when
    render(
      <Board
        projectKey="DIG"
        sprint={sprint}
        selected={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        openKeys={new Set(['DIG-42'])}
        starting={new Set()}
        onStart={vi.fn()}
      />,
    );
    // then
    const starts = screen.getAllByRole('button', { name: /^Start / });
    expect(starts.map((b) => b.getAttribute('aria-label'))).toEqual(['Start DIG-41', 'Start DIG-43']);
  });

  test('a starting tile reads Starting… and is disabled', () => {
    // given
    const sprint = { ...SPRINT, cards: [card('DIG-41', 'To Do'), card('DIG-42', 'To Do')] };
    // when
    render(
      <Board
        projectKey="DIG"
        sprint={sprint}
        selected={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        openKeys={new Set()}
        starting={new Set(['DIG-41'])}
        onStart={vi.fn()}
      />,
    );
    // then
    expect(screen.getByRole('button', { name: 'Start DIG-41' })).toHaveTextContent(/^Starting…$/);
    expect(screen.getByRole('button', { name: 'Start DIG-41' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start DIG-42' })).toBeEnabled();
  });
});
