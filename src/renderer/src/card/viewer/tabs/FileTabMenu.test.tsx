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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    fireEvent.pointerDown(document.body);
    // then
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  test('leaving the window dismisses the menu', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.blur(window);
    // then
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  test('opens with focus on the first item and arrow keys skip disabled items', () => {
    // given
    renderMenu(true);
    const close = screen.getByRole('menuitem', { name: 'Close' });
    expect(close).toHaveFocus();
    // when
    fireEvent.keyDown(close, { key: 'ArrowDown' });
    // then
    expect(screen.getByRole('menuitem', { name: 'Close All' })).toHaveFocus();
  });

  test('a click outside the menu dismisses it', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.pointerDown(document.body);
    // then
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  test('focus moving outside the menu dismisses it', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.focusIn(document.body);
    // then
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  test('focus moving inside the menu does not dismiss it', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.focusIn(screen.getByRole('menuitem', { name: 'Close' }));
    // then
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  test('a click inside the menu does not dismiss it', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Close' }));
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

  test.each([
    { name: 'right', x: 1000, y: 60, left: '884px', top: '60px' },
    { name: 'bottom', x: 40, y: 700, left: '40px', top: '678px' },
    { name: 'corner', x: 1000, y: 700, left: '884px', top: '678px' },
  ])('stays inside the window at the $name edge', ({ x, y, left, top }) => {
    // given
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 140, height: 90 } as DOMRect);
    // when
    render(
      <FileTabMenu
        x={x}
        y={y}
        only={false}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseAll={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // then
    expect(screen.getByRole('menu').style.left).toBe(left);
    expect(screen.getByRole('menu').style.top).toBe(top);
  });
});
