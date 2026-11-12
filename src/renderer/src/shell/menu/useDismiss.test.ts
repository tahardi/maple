import { fireEvent, renderHook } from '@testing-library/react';
import { useDismiss } from './useDismiss';

describe('useDismiss', () => {
  const setup = (open: boolean) => {
    const inside = document.body.appendChild(document.createElement('div'));
    const child = inside.appendChild(document.createElement('button'));
    const outside = document.body.appendChild(document.createElement('button'));
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: { open: boolean }) => {
        useDismiss({ current: inside }, props.open, onDismiss);
      },
      { initialProps: { open } },
    );
    return { child, outside, onDismiss, ...hook };
  };

  afterEach(() => {
    document.body.replaceChildren();
  });

  test.each([
    {
      name: 'a click outside',
      act: (outside: HTMLElement) => fireEvent.pointerDown(outside),
    },
    {
      name: 'focus moving outside',
      act: (outside: HTMLElement) => fireEvent.focusIn(outside),
    },
    {
      name: 'Escape',
      act: () => fireEvent.keyDown(document, { key: 'Escape' }),
    },
    {
      name: 'the window losing focus',
      act: () => fireEvent.blur(window),
    },
  ])('$name dismisses', ({ act }) => {
    // given
    const { outside, onDismiss } = setup(true);
    // when
    act(outside);
    // then
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      name: 'a click inside',
      act: (child: HTMLElement) => fireEvent.pointerDown(child),
    },
    {
      name: 'focus moving inside',
      act: (child: HTMLElement) => fireEvent.focusIn(child),
    },
    {
      name: 'other keys',
      act: () => fireEvent.keyDown(document, { key: 'a' }),
    },
  ])('$name does not dismiss', ({ act }) => {
    // given
    const { child, onDismiss } = setup(true);
    // when
    act(child);
    // then
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('a click outside dismisses even when its target stops propagation', () => {
    // given
    const { outside, onDismiss } = setup(true);
    outside.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    // when
    fireEvent.pointerDown(outside);
    // then
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('Escape it handles is marked as handled', () => {
    // given
    setup(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    // when
    document.dispatchEvent(event);
    // then
    expect(event.defaultPrevented).toBe(true);
  });

  test('starts listening when opened', () => {
    // given
    const { outside, onDismiss, rerender } = setup(false);
    // when
    rerender({ open: true });
    fireEvent.pointerDown(outside);
    // then
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('stops listening when closed', () => {
    // given
    const { outside, onDismiss, rerender } = setup(true);
    // when
    rerender({ open: false });
    fireEvent.pointerDown(outside);
    // then
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('does nothing while closed', () => {
    // given
    const { outside, onDismiss } = setup(false);
    // when
    fireEvent.pointerDown(outside);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.blur(window);
    // then
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('stops listening after unmount', () => {
    // given
    const { outside, onDismiss, unmount } = setup(true);
    unmount();
    // when
    fireEvent.pointerDown(outside);
    fireEvent.focusIn(outside);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.blur(window);
    // then
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
