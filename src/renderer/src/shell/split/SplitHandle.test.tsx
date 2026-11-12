import { fireEvent, render, screen } from '@testing-library/react';
import { SplitHandle } from './SplitHandle';

function fakeDrag() {
  return { size: 32, start: vi.fn(), reset: vi.fn() };
}

describe('SplitHandle', () => {
  test.each([
    { axis: 'x' as const, orientation: 'vertical' },
    { axis: 'y' as const, orientation: 'horizontal' },
  ])('an $axis split is a $orientation separator', ({ axis, orientation }) => {
    // given
    const drag = fakeDrag();
    // when
    render(<SplitHandle drag={drag} axis={axis} label="Resize pane" />);
    // then
    expect(screen.getByRole('separator', { name: 'Resize pane' })).toHaveAttribute('aria-orientation', orientation);
  });

  test('pressing the handle starts a drag', () => {
    // given
    const drag = fakeDrag();
    render(<SplitHandle drag={drag} axis="x" label="Resize pane" />);
    // when
    fireEvent.pointerDown(screen.getByRole('separator'));
    // then
    expect(drag.start).toHaveBeenCalled();
  });

  test('double-clicking the handle resets the split', () => {
    // given
    const drag = fakeDrag();
    render(<SplitHandle drag={drag} axis="x" label="Resize pane" />);
    // when
    fireEvent.doubleClick(screen.getByRole('separator'));
    // then
    expect(drag.reset).toHaveBeenCalled();
  });
});
