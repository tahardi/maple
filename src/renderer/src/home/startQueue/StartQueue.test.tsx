import type { QueueState } from '@shared/types/queue/queueState';
import { render, screen, within } from '@testing-library/react';
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
  fakeMaple({ tabs: { unqueue: vi.fn(() => Promise.resolve()), moveQueued: vi.fn(() => Promise.resolve()) } });
  const { container } = render(<StartQueue queue={queue} titles={titles} />);
  return { container };
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
    expect(within(items[0] ?? document.body).getByRole('button', { name: 'Move DIG-45 down' })).toBeInTheDocument();
  });

  test('each listed card has move and remove controls', async () => {
    // given
    setup(queueOf('DIG-45', 'BEAR-7'));
    // when
    await userEvent.click(screen.getByRole('button', { name: /^2 queued/ }));
    // then
    expect(screen.getByRole('button', { name: 'Move BEAR-7 up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove DIG-45 from the queue' })).toBeInTheDocument();
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
});
