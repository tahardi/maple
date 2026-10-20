import { fireEvent, render, screen } from '@testing-library/react';
import { ScrollSpeed } from './ScrollSpeed';

describe('ScrollSpeed', () => {
  test('shows the current speed', () => {
    // when
    render(<ScrollSpeed value={4} onChange={vi.fn()} />);
    // then
    expect(screen.getByLabelText('Scroll speed')).toHaveValue(4);
  });

  test.each([
    { name: 'a speed in range', typed: '8', saved: [[8]] },
    { name: 'the lowest speed', typed: '1', saved: [[1]] },
    { name: 'the highest speed', typed: '20', saved: [[20]] },
    { name: 'an empty field', typed: '', saved: [] },
    { name: 'zero', typed: '0', saved: [] },
    { name: 'a speed above 20', typed: '21', saved: [] },
    { name: 'a fraction', typed: '2.5', saved: [] },
  ])('typing $name saves only valid speeds', ({ typed, saved }) => {
    // given
    const onChange = vi.fn();
    render(<ScrollSpeed value={3} onChange={onChange} />);
    // when
    fireEvent.change(screen.getByLabelText('Scroll speed'), { target: { value: typed } });
    // then
    expect(onChange.mock.calls).toEqual(saved);
  });
});
