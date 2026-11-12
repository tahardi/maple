import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { buildTree } from './buildTree';
import { FileTree } from './FileTree';

const paths = ['README.md', 'src/a.ts', 'src/b.ts', 'src/c.ts'];
const changes = [
  { path: 'src/a.ts', status: 'A' as const, oldPath: null, stamp: '1:1' },
  { path: 'src/b.ts', status: 'M' as const, oldPath: null, stamp: '1:1' },
  { path: 'src/gone.ts', status: 'D' as const, oldPath: null, stamp: null },
];

function Harness({
  onSelect,
  onPin,
  viewed = new Set(),
  onToggleViewed = vi.fn(),
  commented,
}: {
  onSelect: (path: string) => void;
  onPin?: (path: string) => void;
  viewed?: ReadonlySet<string>;
  onToggleViewed?: (path: string) => void;
  commented?: ReadonlySet<string>;
}) {
  const [changedOnly, setChangedOnly] = useState(false);
  return (
    <FileTree
      nodes={buildTree(paths, changes, changedOnly)}
      selected={null}
      onSelect={onSelect}
      onPin={onPin}
      changedOnly={changedOnly}
      onToggle={setChangedOnly}
      changedCount={changes.length}
      viewed={viewed}
      onToggleViewed={onToggleViewed}
      commented={commented}
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

  test('double-clicking a file pins its path', async () => {
    // given
    const onPin = vi.fn();
    render(<Harness onSelect={vi.fn()} onPin={onPin} />);
    // when
    await userEvent.dblClick(screen.getByText('b.ts'));
    // then
    expect(onPin).toHaveBeenCalledWith('src/b.ts');
  });

  test.each([
    { name: 'a folder', target: () => screen.getByText('src') },
    { name: 'a Viewed checkbox', target: () => screen.getByRole('checkbox', { name: 'Viewed src/b.ts' }) },
  ])('double-clicking $name pins nothing', async ({ target }) => {
    // given
    const onPin = vi.fn();
    render(<Harness onSelect={vi.fn()} onPin={onPin} />);
    // when
    await userEvent.dblClick(target());
    // then
    expect(onPin).not.toHaveBeenCalled();
  });

  test('groups All files and Changed as one control', () => {
    // given
    // when
    render(<Harness onSelect={vi.fn()} />);
    // then
    const group = within(screen.getByRole('group', { name: 'Files shown' }));
    expect(group.getByRole('button', { name: 'All files' })).toBeInTheDocument();
    expect(group.getByRole('button', { name: 'Changed (3)' })).toBeInTheDocument();
  });

  test('toggle returns to all files and marks the pressed button', async () => {
    // given
    render(<Harness onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Changed (3)' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'All files' }));
    // then
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All files' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Changed (3)' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a folder collapses it without selecting anything', async () => {
    // given
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    expect(screen.getByText('src').parentElement).toHaveAttribute('aria-expanded', 'true');
    // when
    await userEvent.click(screen.getByText('src'));
    // then
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('src').parentElement).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking a collapsed folder expands it again', async () => {
    // given
    render(<Harness onSelect={vi.fn()} />);
    await userEvent.click(screen.getByText('src'));
    // when
    await userEvent.click(screen.getByText('src'));
    // then
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('src').parentElement).toHaveAttribute('aria-expanded', 'true');
  });

  test('a collapsed folder stays collapsed across the changed toggle', async () => {
    // given
    render(<Harness onSelect={vi.fn()} />);
    await userEvent.click(screen.getByText('src'));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Changed (3)' }));
    // then
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.queryByText('gone.ts')).not.toBeInTheDocument();
  });

  test('with folders closed by default shows only the top level until a folder is opened', async () => {
    // given
    render(
      <FileTree
        nodes={buildTree(['README.md', 'src/lib/a.ts'], [], false)}
        selected={null}
        onSelect={vi.fn()}
        changedOnly={false}
        onToggle={vi.fn()}
        changedCount={0}
        collapsedByDefault
      />,
    );
    expect(screen.getByText('src').parentElement).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('lib')).not.toBeInTheDocument();
    // when
    await userEvent.click(screen.getByText('src'));
    // then
    expect(screen.getByText('lib').parentElement).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  test('shows a badge for each changed file only', () => {
    // given
    render(<Harness onSelect={vi.fn()} />);
    // when
    const badges = ['A', 'M', 'D'].map((s) => screen.getAllByText(s).length);
    // then
    expect(badges).toEqual([1, 1, 1]);
    expect(screen.getByText('c.ts').parentElement).toHaveTextContent(/^c\.ts$/);
  });

  test('marks only the files with review comments', () => {
    // given
    const commented = new Set(['src/b.ts', 'README.md']);
    // when
    render(<Harness onSelect={vi.fn()} commented={commented} />);
    // then
    const marks = screen.getAllByRole('img', { name: /^Has review comments$/ });
    expect(marks.map((mark) => mark.closest('li')?.textContent)).toEqual([
      expect.stringMatching(/^b\.ts/),
      expect.stringMatching(/^README\.md/),
    ]);
  });

  test('changed files have a Viewed checkbox that does not open the file', async () => {
    // given
    const onSelect = vi.fn();
    const onToggleViewed = vi.fn();
    render(<Harness onSelect={onSelect} viewed={new Set(['src/a.ts'])} onToggleViewed={onToggleViewed} />);
    // when
    await userEvent.click(screen.getByRole('checkbox', { name: 'Viewed src/b.ts' }));
    // then
    expect(onToggleViewed).toHaveBeenCalledWith('src/b.ts');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Viewed src/a.ts' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Viewed src/b.ts' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Viewed src/gone.ts' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  test('rows have no Viewed checkbox without a toggle handler', () => {
    // given
    const nodes = buildTree(paths, changes, false);
    // when
    render(
      <FileTree
        nodes={nodes}
        selected={null}
        onSelect={vi.fn()}
        changedOnly={false}
        onToggle={vi.fn()}
        changedCount={changes.length}
      />,
    );
    // then
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
