import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { card } from '../testing/sprintFixture';
import { CardTile } from './CardTile';

describe('CardTile', () => {
  test('shows labels as neutral badges', () => {
    // given
    // when
    render(
      <CardTile
        card={card('DIG-44', 'To Do')}
        selected={false}
        onSelect={vi.fn()}
        onToggle={null}
        onStart={null}
        starting={false}
        queued={[]}
      />,
    );
    // then
    expect(screen.getByText('parallelizable')).toHaveAttribute('data-tone', 'neutral');
  });

  test('shows no checkbox without onToggle', () => {
    // given
    render(
      <CardTile
        card={card('DIG-44', 'To Do')}
        selected={false}
        onSelect={vi.fn()}
        onToggle={null}
        onStart={null}
        starting={false}
        queued={[]}
      />,
    );
    // when
    const checkbox = screen.queryByRole('checkbox');
    // then
    expect(checkbox).not.toBeInTheDocument();
  });

  test('clicking the checkbox toggles the card without selecting it', async () => {
    // given
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <CardTile
        card={card('DIG-44', 'To Do')}
        selected={false}
        onSelect={onSelect}
        onToggle={onToggle}
        onStart={null}
        starting={false}
        queued={[]}
      />,
    );
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
    render(
      <CardTile
        card={card('DIG-44', 'To Do')}
        selected={selected}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onStart={null}
        starting={false}
        queued={[]}
      />,
    );
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
    render(
      <CardTile
        card={card('DIG-44', 'To Do', { epic })}
        selected={false}
        onSelect={vi.fn()}
        onToggle={null}
        onStart={null}
        starting={false}
        queued={[]}
      />,
    );
    // when
    const lozenge = screen.getByRole('button', { name: /^DIG-44/ }).querySelector('[data-color]');
    // then
    expect(lozenge?.getAttribute('data-color') ?? null).toBe(want);
    expect(lozenge?.textContent ?? null).toBe(epic?.summary ?? null);
  });

  test('Start starts the card without selecting it', async () => {
    // given
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(
      <CardTile
        card={card('DIG-41', 'To Do')}
        selected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
        onStart={onStart}
        starting={false}
        queued={[]}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start DIG-41' }));
    // then
    expect(onStart).toHaveBeenCalledWith('DIG-41');
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('no onStart shows no Start', () => {
    // given
    // when
    render(
      <CardTile
        card={card('DIG-41', 'To Do')}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onStart={null}
        starting={false}
        queued={[]}
      />,
    );
    // then
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument();
  });

  test('while starting, Start reads Starting… and is disabled', () => {
    // given
    // when
    render(
      <CardTile
        card={card('DIG-41', 'To Do')}
        selected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onStart={vi.fn()}
        starting
        queued={[]}
      />,
    );
    // then
    const start = screen.getByRole('button', { name: 'Start DIG-41' });
    expect(start).toHaveTextContent(/^Starting…$/);
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('aria-busy', 'true');
  });

  test('a queued card shows Queued #N instead of Start and no checkbox', () => {
    // given
    // when
    render(
      <CardTile
        card={card('DIG-44', 'To Do')}
        selected={false}
        onSelect={vi.fn()}
        onToggle={null}
        onStart={null}
        starting={false}
        queued={['DIG-40', 'DIG-44']}
      />,
    );
    // then
    expect(screen.getByText('Queued #2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start DIG-44' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  test('a queued card offers move and remove controls', () => {
    // given
    // when
    render(
      <CardTile
        card={card('DIG-44', 'To Do')}
        selected={false}
        onSelect={vi.fn()}
        onToggle={null}
        onStart={null}
        starting={false}
        queued={['DIG-40', 'DIG-44']}
      />,
    );
    // then
    expect(screen.getByRole('button', { name: 'Move DIG-44 up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move DIG-44 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove DIG-44 from the queue' })).toBeInTheDocument();
  });
});
