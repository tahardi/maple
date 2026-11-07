import { render, screen } from '@testing-library/react';
import { RepoBranch } from './RepoBranch';

const repo = { name: 'maple', branch: 'mpl-20-file-tree' };

describe('RepoBranch', () => {
  test('labels the repo and the branch', () => {
    // given
    const props = { repo };
    // when
    render(<RepoBranch {...props} />);
    // then
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Repo', 'Branch']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['maple', 'mpl-20-file-tree']);
  });

  test('shows each full value in a tooltip', () => {
    // given
    const props = { repo };
    // when
    render(<RepoBranch {...props} />);
    // then
    expect(screen.getAllByRole('definition').map((d) => d.getAttribute('title'))).toEqual([
      'maple',
      'mpl-20-file-tree',
    ]);
  });
});
