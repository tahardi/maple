import { render, screen } from '@testing-library/react';
import { EpicLozenge } from './EpicLozenge';

describe('EpicLozenge', () => {
  test.each([
    { color: 'purple', want: 'purple' },
    { color: 'dark_blue', want: 'blue' },
    { color: 'chartreuse', want: 'grey' },
    { color: null, want: 'grey' },
  ])('$color shows as $want', ({ color, want }) => {
    // given
    const epic = { key: 'DIG-2', summary: 'Search', color };
    // when
    render(<EpicLozenge epic={epic} />);
    // then
    const lozenge = screen.getByText('Search');
    expect(lozenge.dataset.color).toBe(want);
    expect(lozenge.title).toBe('DIG-2');
  });
});
