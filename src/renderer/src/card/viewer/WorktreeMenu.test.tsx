import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorktreeMenu } from './WorktreeMenu';

const props = {
  label: 'xena · xena-62-vm-net',
  paths: ['/wts/halo-xena-62-config', '/wts/xena-xena-62-vm-net'],
  selected: '/wts/xena-xena-62-vm-net',
};

describe('WorktreeMenu', () => {
  const openMenu = () => userEvent.click(screen.getByRole('button', { name: /^Repo/ }));

  test('shows the selected repo and branch on the button', () => {
    // given
    const onSelect = vi.fn();
    // when
    render(
      <WorktreeMenu {...props} onSelect={onSelect}>
        <span>xena on xena-62-vm-net</span>
      </WorktreeMenu>,
    );
    // then
    const button = screen.getByRole('button', { name: 'Repo: xena · xena-62-vm-net' });
    expect(button).toHaveAttribute('title', 'xena · xena-62-vm-net');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveTextContent('xena on xena-62-vm-net');
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
});
