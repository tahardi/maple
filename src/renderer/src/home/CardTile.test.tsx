import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { card } from '../testing/sprintFixture';
import { CardTile } from './CardTile';

describe('CardTile', () => {
  test('shows no checkbox without onToggle', () => {
    // given
    render(<CardTile card={card('DIG-44', 'To Do')} selected={false} onSelect={vi.fn()} onToggle={null} />);
    // when
    const checkbox = screen.queryByRole('checkbox');
    // then
    expect(checkbox).not.toBeInTheDocument();
  });

  test('clicking the checkbox toggles the card without selecting it', async () => {
    // given
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(<CardTile card={card('DIG-44', 'To Do')} selected={false} onSelect={onSelect} onToggle={onToggle} />);
    // when
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select DIG-44' }));
    // then
    expect(onToggle).toHaveBeenCalledWith('DIG-44');
    expect(onSelect).not.toHaveBeenCalled();
  });

  test.each([
    { selected: true, checked: true, highlighted: 'true' },
    { selected: false, checked: false, highlighted: undefined },
  ])('selected=$selected checks the box and highlights the tile', ({ selected, checked, highlighted }) => {
    // given
    render(<CardTile card={card('DIG-44', 'To Do')} selected={selected} onSelect={vi.fn()} onToggle={vi.fn()} />);
    // when
    const tile = screen.getByRole('button', { name: /^DIG-44/ });
    // then
    expect(screen.getByRole('checkbox', { name: 'Select DIG-44' })).toHaveProperty('checked', checked);
    expect(tile.dataset.highlighted).toBe(highlighted);
  });

  test.each([
    { name: 'a card with an epic', epic: { key: 'DIG-2', summary: 'Search', color: 'green' }, want: 'green' },
    { name: 'a card without an epic', epic: null, want: null },
  ])('$name shows the epic lozenge', ({ epic, want }) => {
    // given
    render(<CardTile card={card('DIG-44', 'To Do', { epic })} selected={false} onSelect={vi.fn()} onToggle={null} />);
    // when
    const lozenge = screen.getByRole('button', { name: /^DIG-44/ }).querySelector('[data-color]');
    // then
    expect(lozenge?.getAttribute('data-color') ?? null).toBe(want);
    expect(lozenge?.textContent ?? null).toBe(epic?.summary ?? null);
  });
});
