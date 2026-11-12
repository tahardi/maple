import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { SHORTCUTS } from './shortcuts';
import { ShortcutSheet } from './ShortcutSheet';

function setup() {
  let requested: () => void = () => undefined;
  fakeMaple({
    app: {
      onShortcutsRequested: (cb) => {
        requested = cb;
        return () => undefined;
      },
    },
  });
  render(<ShortcutSheet />);
  const request = () => {
    act(() => {
      requested();
    });
  };
  return { request };
}

describe('ShortcutSheet', () => {
  test('? opens a sheet listing every shortcut', async () => {
    // given
    setup();
    // when
    await userEvent.keyboard('?');
    // then
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(sheet).getAllByRole('row')).toHaveLength(SHORTCUTS.length);
    expect(within(sheet).getByText('Ctrl+Tab')).toBeInTheDocument();
    expect(within(sheet).getByText('Ctrl+Shift+W')).toBeInTheDocument();
  });

  test('? typed in a text field does not open the sheet', async () => {
    // given
    setup();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    // when
    await userEvent.keyboard('?');
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    input.remove();
  });

  test('Ctrl+? does not open the sheet', async () => {
    // given
    setup();
    // when
    await userEvent.keyboard('{Control>}?{/Control}');
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Help > Keyboard shortcuts opens the sheet', () => {
    // given
    const { request } = setup();
    // when
    request();
    // then
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  test('unmounting stops listening for the menu', () => {
    // given
    const stop = vi.fn();
    fakeMaple({ app: { onShortcutsRequested: () => stop } });
    const { unmount } = render(<ShortcutSheet />);
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalledOnce();
  });

  test.each([
    {
      how: 'Escape',
      close: () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })),
    },
    { how: 'the Close button', close: () => userEvent.click(screen.getByRole('button', { name: 'Close' })) },
  ])('$how closes the sheet', async ({ close }) => {
    // given
    const { request } = setup();
    request();
    // when
    await close();
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
