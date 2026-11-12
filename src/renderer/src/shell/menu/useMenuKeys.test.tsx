import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useMenuKeys } from './useMenuKeys';

function Menu({ open, checked = false }: { open: boolean; checked?: boolean }) {
  const menu = useRef<HTMLDivElement>(null);
  const onKeyDown = useMenuKeys(menu, open);
  return (
    <>
      <button>trigger</button>
      {open && (
        <div ref={menu} role="menu" onKeyDown={onKeyDown}>
          <button role="menuitem" disabled>
            off
          </button>
          <button role="menuitem">one</button>
          <button role="menuitem">two</button>
          <button role="menuitemradio" aria-checked={checked}>
            three
          </button>
        </div>
      )}
    </>
  );
}

const item = (name: string) => screen.getByRole(/three/.test(name) ? 'menuitemradio' : 'menuitem', { name });

describe('useMenuKeys', () => {
  test('opening focuses the first enabled item', () => {
    // given
    const { rerender } = render(<Menu open={false} />);
    // when
    rerender(<Menu open />);
    // then
    expect(item('one')).toHaveFocus();
  });

  test('opening focuses the checked item when there is one', () => {
    // given
    const { rerender } = render(<Menu open={false} checked />);
    // when
    rerender(<Menu open checked />);
    // then
    expect(item('three')).toHaveFocus();
  });

  test('closing returns focus to where it was', () => {
    // given
    const { rerender } = render(<Menu open={false} />);
    screen.getByRole('button', { name: 'trigger' }).focus();
    rerender(<Menu open />);
    // when
    rerender(<Menu open={false} />);
    // then
    expect(screen.getByRole('button', { name: 'trigger' })).toHaveFocus();
  });

  test.each([
    { name: 'ArrowDown moves to the next item', key: 'ArrowDown', from: 'one', want: 'two' },
    { name: 'ArrowDown wraps to the first enabled item', key: 'ArrowDown', from: 'three', want: 'one' },
    { name: 'ArrowUp moves to the previous item', key: 'ArrowUp', from: 'three', want: 'two' },
    { name: 'ArrowUp wraps past disabled items to the last', key: 'ArrowUp', from: 'one', want: 'three' },
    { name: 'Home moves to the first enabled item', key: 'Home', from: 'three', want: 'one' },
    { name: 'End moves to the last item', key: 'End', from: 'one', want: 'three' },
    { name: 'other keys stay put', key: 'a', from: 'two', want: 'two' },
  ])('$name', ({ key, from, want }) => {
    // given
    render(<Menu open />);
    item(from).focus();
    // when
    fireEvent.keyDown(item(from), { key });
    // then
    expect(item(want)).toHaveFocus();
  });
});
