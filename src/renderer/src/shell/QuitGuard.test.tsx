import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { QuitGuard } from './QuitGuard';

function setup() {
  let requested: (keys: string[]) => void = () => undefined;
  const confirmQuit = vi.fn();
  fakeMaple({
    app: {
      confirmQuit,
      onQuitRequested: (cb) => {
        requested = cb;
        return () => undefined;
      },
    },
  });
  render(<QuitGuard />);
  const request = (keys: string[]) => {
    act(() => {
      requested(keys);
    });
  };
  return { confirmQuit, request };
}

describe('QuitGuard', () => {
  test('shows nothing until a quit is requested', () => {
    // given
    setup();
    // when
    const dialog = screen.queryByRole('dialog');
    // then
    expect(dialog).not.toBeInTheDocument();
  });

  test.each([
    { keys: ['DIG-44'], body: 'Quit while DIG-44 is working?' },
    { keys: ['DIG-44', 'BEAR-12'], body: 'Quit while DIG-44, BEAR-12 are working?' },
  ])('a quit request names $keys', ({ keys, body }) => {
    // given
    const { request } = setup();
    // when
    request(keys);
    // then
    expect(screen.getByRole('dialog')).toHaveTextContent(body);
  });

  test('confirming calls confirmQuit', async () => {
    // given
    const { confirmQuit, request } = setup();
    request(['DIG-44']);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Quit' }));
    // then
    expect(confirmQuit).toHaveBeenCalledOnce();
  });

  test('cancelling closes the dialog and calls nothing', async () => {
    // given
    const { confirmQuit, request } = setup();
    request(['DIG-44']);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // then
    expect(confirmQuit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
