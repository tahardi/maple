import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { buildTree } from './buildTree';
import { FileTree } from './FileTree';

const paths = ['README.md', 'src/a.ts', 'src/b.ts', 'src/c.ts'];
const changes = [
  { path: 'src/a.ts', status: 'A' as const, oldPath: null },
  { path: 'src/b.ts', status: 'M' as const, oldPath: null },
  { path: 'src/gone.ts', status: 'D' as const, oldPath: null },
];

function Harness({ onSelect }: { onSelect: (path: string) => void }) {
  const [changedOnly, setChangedOnly] = useState(false);
  return (
    <FileTree
      nodes={buildTree(paths, changes, changedOnly)}
      selected={null}
      onSelect={onSelect}
      changedOnly={changedOnly}
      onToggle={setChangedOnly}
      changedCount={changes.length}
    />
  );
}

describe('FileTree', () => {
  test('toggle switches between all files and changed files', async () => {
    // given
    render(<Harness onSelect={vi.fn()} />);
    expect(screen.getByText('README.md')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Changed (3)' }));
    // then
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();
    expect(screen.queryByText('c.ts')).not.toBeInTheDocument();
    expect(screen.getByText('gone.ts')).toBeInTheDocument();
  });

  test('clicking a file selects its path', async () => {
    // given
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    // when
    await userEvent.click(screen.getByText('b.ts'));
    // then
    expect(onSelect).toHaveBeenCalledWith('src/b.ts');
  });
});
