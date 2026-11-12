import type { QueueState } from '@shared/types/queue/queueState';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { StartQueue } from './StartQueue';

function queueOf(...keys: string[]): QueueState {
  return {
    cards: keys.map((cardKey) => ({ projectKey: cardKey.split('-')[0] ?? '', cardKey })),
    working: 6,
    limit: 6,
    waitingFor: 'room',
    gapSeconds: 90,
    failure: null,
  };
}

function setup(queue: QueueState, titles: ReadonlyMap<string, string> = new Map()) {
  const unqueue = vi.fn(() => Promise.resolve());
  const moveQueued = vi.fn(() => Promise.resolve());
  fakeMaple({ tabs: { unqueue, moveQueued } });
  const { container } = render(<StartQueue queue={queue} titles={titles} />);
  return { container, unqueue, moveQueued };
}

describe('StartQueue', () => {
  test.each([
    { name: 'nothing is queued', failure: null },
    { name: 'nothing is queued but a start failed', failure: 'starting DIG-45: boom' },
  ])('renders nothing when $name', ({ failure }) => {
    // given
    const queue = { ...queueOf(), waitingFor: null, failure };
    // when
    const { container } = setup(queue);
    // then
    expect(container).toBeEmptyDOMElement();
  });

  test.each([
    { waitingFor: 'room' as const, limit: 6, text: '2 queued · Waiting for room: 6 of 6 working' },
    { waitingFor: 'cpu' as const, limit: 8, text: '2 queued · Waiting for CPU: 6 working' },
    { waitingFor: null, limit: 8, text: '2 queued' },
  ])('the pill reads $text', ({ waitingFor, limit, text }) => {
    // given
    const queue = { ...queueOf('DIG-45', 'DIG-46'), limit, waitingFor };
    // when
    setup(queue);
    // then
    const pill = screen.getByRole('button', { name: text });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking the pill lists every queued card in order with its title when known', async () => {
    // given
    setup(queueOf('DIG-45', 'BEAR-7'), new Map([['DIG-45', 'Summary of DIG-45']]));
    const pill = screen.getByRole('button', { name: /^2 queued/ });
    // when
    await userEvent.click(pill);
    // then
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    const items = within(screen.getByRole('list', { name: 'Start queue' })).getAllByRole('listitem');
    expect(items.map((item) => item.firstElementChild?.textContent)).toEqual([
      '#1 DIG-45 Summary of DIG-45',
      '#2 BEAR-7',
    ]);
  });

  test('each listed card has only a remove button', async () => {
    // given
    setup(queueOf('DIG-45', 'BEAR-7'));
    // when
    await userEvent.click(screen.getByRole('button', { name: /^2 queued/ }));
    // then
    const list = screen.getByRole('list', { name: 'Start queue' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Remove DIG-45 from the queue', 'Remove BEAR-7 from the queue']);
  });

  test('Remove calls unqueue', async () => {
    // given
    const { unqueue } = setup(queueOf('DIG-45'));
    await userEvent.click(screen.getByRole('button', { name: /^1 queued/ }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Remove DIG-45 from the queue' }));
    // then
    expect(unqueue).toHaveBeenCalledWith('DIG-45');
  });

  test.each([
    { name: 'the last card onto the first', from: 2, to: 0, want: ['DIG-47', 0] },
    { name: 'the first card onto the last', from: 0, to: 2, want: ['DIG-45', 2] },
    { name: 'the middle card onto the last', from: 1, to: 2, want: ['DIG-46', 2] },
  ])('dragging $name moves it to that place', async ({ from, to, want }) => {
    // given
    const { moveQueued } = setup(queueOf('DIG-45', 'DIG-46', 'DIG-47'));
    await userEvent.click(screen.getByRole('button', { name: /^3 queued/ }));
    const items = within(screen.getByRole('list', { name: 'Start queue' })).getAllByRole('listitem');
    // when
    fireEvent.dragStart(items[from] ?? document.body);
    fireEvent.dragOver(items[to] ?? document.body);
    fireEvent.drop(items[to] ?? document.body);
    // then
    expect(moveQueued.mock.calls).toEqual([want]);
  });

  test('dropping a card on itself moves nothing', async () => {
    // given
    const { moveQueued } = setup(queueOf('DIG-45', 'DIG-46'));
    await userEvent.click(screen.getByRole('button', { name: /^2 queued/ }));
    const first = within(screen.getByRole('list', { name: 'Start queue' })).getByText(/DIG-45/);
    // when
    fireEvent.dragStart(first);
    fireEvent.drop(first);
    // then
    expect(moveQueued).not.toHaveBeenCalled();
  });

  test('each listed card can be dragged', async () => {
    // given
    setup(queueOf('DIG-45', 'DIG-46'));
    // when
    await userEvent.click(screen.getByRole('button', { name: /^2 queued/ }));
    // then
    const items = within(screen.getByRole('list', { name: 'Start queue' })).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('draggable'))).toEqual(['true', 'true']);
  });

  test.each([
    { name: 'Escape', act: () => userEvent.keyboard('{Escape}') },
    { name: 'a click outside', act: () => userEvent.click(document.body) },
  ])('$name closes the list', async ({ act }) => {
    // given
    setup(queueOf('DIG-45'));
    await userEvent.click(screen.getByRole('button', { name: /^1 queued/ }));
    // when
    await act();
    // then
    expect(screen.queryByRole('list', { name: 'Start queue' })).not.toBeInTheDocument();
  });

  test('a second click on the pill closes the list', async () => {
    // given
    setup(queueOf('DIG-45'));
    const pill = screen.getByRole('button', { name: /^1 queued/ });
    await userEvent.click(pill);
    // when
    await userEvent.click(pill);
    // then
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Start queue' })).not.toBeInTheDocument();
  });

  test('an open list closes when the queue empties and stays closed when cards return', async () => {
    // given
    const titles = new Map<string, string>();
    const { rerender } = render(<StartQueue queue={queueOf('DIG-45')} titles={titles} />);
    await userEvent.click(screen.getByRole('button', { name: /^1 queued/ }));
    rerender(<StartQueue queue={queueOf()} titles={titles} />);
    // when
    rerender(<StartQueue queue={queueOf('DIG-46')} titles={titles} />);
    // then
    expect(screen.getByRole('button', { name: /^1 queued/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Start queue' })).not.toBeInTheDocument();
  });
});
