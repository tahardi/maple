import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTabMenu } from './FileTabMenu';

function renderMenu(only = false) {
  const props = {
    x: 40,
    y: 60,
    only,
    onClose: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseAll: vi.fn(),
    onDismiss: vi.fn(),
  };
  const { unmount } = render(<FileTabMenu {...props} />);
  return { ...props, unmount };
}

describe('FileTabMenu', () => {
  test.each([
    { label: 'Close', handler: 'onClose' },
    { label: 'Close Others', handler: 'onCloseOthers' },
    { label: 'Close All', handler: 'onCloseAll' },
  ] as const)('$label calls its handler', async ({ label, handler }) => {
    // given
    const props = renderMenu();
    // when
    await userEvent.click(screen.getByRole('menuitem', { name: label }));
    // then
    expect(props[handler]).toHaveBeenCalledTimes(1);
  });

  test('disables Close Others when the tab is the only one open', async () => {
    // given
    const props = renderMenu(true);
    const item = screen.getByRole('menuitem', { name: 'Close Others' });
    // when
    await userEvent.click(item);
    // then
    expect(item).toBeDisabled();
    expect(props.onCloseOthers).not.toHaveBeenCalled();
  });

  test('Escape dismisses the menu', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.keyDown(document, { key: 'Escape' });
    // then
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  test('other keys do not dismiss the menu', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.keyDown(document, { key: 'a' });
    // then
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  test('stops listening once unmounted', () => {
    // given
    const props = renderMenu();
    props.unmount();
    // when
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(document.body);
    // then
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  test('a click outside the menu dismisses it', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.mouseDown(document.body);
    // then
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  test('a click inside the menu does not dismiss it', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Close' }));
    // then
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  test('opens at the pointer', () => {
    // given
    renderMenu();
    // when
    const menu = screen.getByRole('menu');
    // then
    expect(menu.style.left).toBe('40px');
    expect(menu.style.top).toBe('60px');
  });
});
