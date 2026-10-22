import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VaultSwitch } from './VaultSwitch';

describe('VaultSwitch', () => {
  test.each([
    { view: 'worktree' as const, pressed: 'Worktree', refresh: false },
    { view: 'vault' as const, pressed: 'Vault', refresh: true },
  ])('presses $pressed for the $view view', ({ view, pressed, refresh }) => {
    // given
    const props = { view, onChange: vi.fn(), onRefresh: vi.fn() };
    // when
    render(<VaultSwitch {...props} />);
    // then
    expect(screen.getByRole('button', { name: pressed, pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' }) !== null).toBe(refresh);
  });

  test('reports the chosen view and refreshes', async () => {
    // given
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    render(<VaultSwitch view="vault" onChange={onChange} onRefresh={onRefresh} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Worktree' }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    // then
    expect(onChange).toHaveBeenCalledWith('worktree');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
