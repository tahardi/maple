import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { QueueControls } from './QueueControls';

function setup(index: number, count: number) {
  const unqueue = vi.fn(() => Promise.resolve());
  const moveQueued = vi.fn(() => Promise.resolve());
  fakeMaple({ tabs: { unqueue, moveQueued } });
  render(<QueueControls cardKey="DIG-46" index={index} count={count} />);
  return { unqueue, moveQueued };
}

describe('QueueControls', () => {
  test('Move up and Move down call moveQueued', async () => {
    // given
    const { moveQueued } = setup(1, 3);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Move DIG-46 up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move DIG-46 down' }));
    // then
    expect(moveQueued.mock.calls).toEqual([
      ['DIG-46', -1],
      ['DIG-46', 1],
    ]);
  });

  test.each([
    { name: 'the first cannot move up', index: 0, disabled: 'up', enabled: 'down' },
    { name: 'the last cannot move down', index: 1, disabled: 'down', enabled: 'up' },
  ])('$name', ({ index, disabled, enabled }) => {
    // given
    // when
    setup(index, 2);
    // then
    expect(screen.getByRole('button', { name: `Move DIG-46 ${disabled}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Move DIG-46 ${enabled}` })).toBeEnabled();
  });

  test('Remove calls unqueue', async () => {
    // given
    const { unqueue } = setup(0, 1);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Remove DIG-46 from the queue' }));
    // then
    expect(unqueue).toHaveBeenCalledWith('DIG-46');
  });
});
