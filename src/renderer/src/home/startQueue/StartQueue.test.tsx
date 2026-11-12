import type { QueueState } from '@shared/types/queue/queueState';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { StartQueue } from './StartQueue';

function queueOf(...keys: string[]): QueueState {
  return {
    cards: keys.map((cardKey) => ({ projectKey: 'DIG', cardKey })),
    working: 2,
    limit: 4,
    waitingFor: 'room',
    failure: null,
  };
}

function setup(queue: QueueState) {
  const unqueue = vi.fn(() => Promise.resolve());
  const moveQueued = vi.fn(() => Promise.resolve());
  fakeMaple({ tabs: { unqueue, moveQueued } });
  const { container } = render(<StartQueue queue={queue} />);
  return { unqueue, moveQueued, container };
}

describe('StartQueue', () => {
  test('renders nothing when no card waits and nothing failed', () => {
    // given
    const queue = { ...queueOf(), waitingFor: null };
    // when
    const { container } = setup(queue);
    // then
    expect(container).toBeEmptyDOMElement();
  });

  test('lists the waiting cards in order', () => {
    // given
    const queue = queueOf('DIG-45', 'DIG-46');
    // when
    setup(queue);
    // then
    const list = screen.getByRole('list', { name: 'Start queue' });
    const keys = within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')?.textContent);
    expect(keys).toEqual(['DIG-45', 'DIG-46']);
  });

  test.each([
    { waitingFor: 'room' as const, limit: 6, text: 'Waiting for room: 6 of 6 working' },
    { waitingFor: 'cpu' as const, limit: 8, text: 'Waiting for CPU: 6 working' },
    { waitingFor: 'memory' as const, limit: 8, text: 'Waiting for memory: 6 working' },
    { waitingFor: 'pace' as const, limit: 8, text: 'Starting one more every 15 seconds: 6 working' },
  ])('waiting for $waitingFor shows $text', ({ waitingFor, limit, text }) => {
    // given
    const queue = { ...queueOf('DIG-45'), working: 6, limit, waitingFor };
    // when
    setup(queue);
    // then
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('Move up and Move down call moveQueued', async () => {
    // given
    const { moveQueued } = setup(queueOf('DIG-45', 'DIG-46', 'DIG-47'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Move DIG-46 up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move DIG-46 down' }));
    // then
    expect(moveQueued.mock.calls).toEqual([
      ['DIG-46', -1],
      ['DIG-46', 1],
    ]);
  });

  test('the first card cannot move up and the last cannot move down', () => {
    // given
    const queue = queueOf('DIG-45', 'DIG-46');
    // when
    setup(queue);
    // then
    expect(screen.getByRole('button', { name: 'Move DIG-45 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move DIG-46 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move DIG-45 down' })).toBeEnabled();
  });

  test('Remove calls unqueue', async () => {
    // given
    const { unqueue } = setup(queueOf('DIG-45'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Remove DIG-45 from the queue' }));
    // then
    expect(unqueue).toHaveBeenCalledWith('DIG-45');
  });

  test('shows a failed queued start in an alert', () => {
    // given
    const queue = { ...queueOf(), waitingFor: null, failure: 'starting DIG-45: no worktree' };
    // when
    setup(queue);
    // then
    expect(screen.getByRole('alert')).toHaveTextContent('starting DIG-45: no worktree');
  });
});
