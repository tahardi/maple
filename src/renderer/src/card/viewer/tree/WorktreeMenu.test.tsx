import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorktreeMenu } from './WorktreeMenu';

const props = {
  label: 'xena',
  paths: ['/wts/halo-xena-62-config', '/wts/xena-xena-62-vm-net'],
  selected: '/wts/xena-xena-62-vm-net',
};

describe('WorktreeMenu', () => {
  const openMenu = () => userEvent.click(screen.getByRole('button', { name: /^Repo/ }));

  test('shows the selected repo on the button', () => {
    // given
    const onSelect = vi.fn();
    // when
    render(<WorktreeMenu {...props} onSelect={onSelect} />);
    // then
    const button = screen.getByRole('button', { name: 'Repo: xena' });
    expect(button).toHaveAttribute('title', 'xena');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveTextContent(/^xena▾$/);
  });

  test('lists every worktree by folder name with the selected one checked', async () => {
    // given
    render(<WorktreeMenu {...props} onSelect={vi.fn()} />);
    // when
    await openMenu();
    // then
    expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual([
      'halo-xena-62-config',
      'xena-xena-62-vm-net',
    ]);
    expect(screen.getByRole('menuitemradio', { checked: true })).toHaveTextContent('xena-xena-62-vm-net');
  });

  test('choosing a worktree selects it and closes the menu', async () => {
    // given
    const onSelect = vi.fn();
    render(<WorktreeMenu {...props} onSelect={onSelect} />);
    await openMenu();
    // when
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'halo-xena-62-config' }));
    // then
    expect(onSelect).toHaveBeenCalledWith('/wts/halo-xena-62-config');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clicking outside closes the menu', async () => {
    // given
    render(<WorktreeMenu {...props} onSelect={vi.fn()} />);
    await openMenu();
    // when
    await userEvent.click(document.body);
    // then
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clicking the button again closes the menu', async () => {
    // given
    render(<WorktreeMenu {...props} onSelect={vi.fn()} />);
    await openMenu();
    // when
    await openMenu();
    // then
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('opening focuses the selected worktree and arrow keys move through the list', async () => {
    // given
    render(<WorktreeMenu {...props} onSelect={vi.fn()} />);
    await openMenu();
    expect(screen.getByRole('menuitemradio', { name: 'xena-xena-62-vm-net' })).toHaveFocus();
    // when
    await userEvent.keyboard('{ArrowDown}');
    // then
    expect(screen.getByRole('menuitemradio', { name: 'halo-xena-62-config' })).toHaveFocus();
  });

  test('Escape closes the menu and returns focus to the button', async () => {
    // given
    render(<WorktreeMenu {...props} onSelect={vi.fn()} />);
    await openMenu();
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Repo/ })).toHaveFocus();
  });
});
