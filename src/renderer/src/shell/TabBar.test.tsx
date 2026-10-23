import type { TabState } from '@shared/types/tabs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { TabBar } from './TabBar';

const tab = (id: string, projectKey: string, kind: TabState['kind'], cardKey: string | null): TabState => ({
  id,
  projectKey,
  kind,
  cardKey,
  sessionId: `s-${id}`,
  worktreePath: null,
});

const VAULT_CONFIG = { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/vault' } };

describe('TabBar', () => {
  beforeEach(() => {
    fakeMaple();
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({
      config: FAKE_CONFIG,
      projectKey: 'BEAR',
      tabs: [
        tab('t1', 'BEAR', 'card', 'BEAR-1'),
        tab('t2', 'BEAR', 'card', 'BEAR-2'),
        tab('t3', 'BEAR', 'planner', null),
        tab('t4', 'DIG', 'card', 'DIG-1'),
      ],
    });
  });

  test('shows Home and the selected project card tabs only', () => {
    // given
    render(<TabBar />);
    // when
    const labels = screen.getAllByRole('tab').map((t) => t.textContent);
    // then
    expect(labels).toEqual(['Home', 'BEAR-1', 'BEAR-2']);
    const inbox = screen.getByRole('button', { name: /^Inbox/ });
    expect(within(screen.getByRole('tablist')).queryByRole('button', { name: /^Inbox/ })).not.toBeInTheDocument();
    expect(inbox.compareDocumentPosition(screen.getByRole('combobox', { name: 'Project' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test('shows a Vault tab after Home when the vault is configured', () => {
    // given
    useMaple.setState({ config: VAULT_CONFIG });
    render(<TabBar />);
    // when
    const labels = screen.getAllByRole('tab').map((t) => t.textContent);
    // then
    expect(labels).toEqual(['Home', 'Vault', 'BEAR-1', 'BEAR-2']);
  });

  test('clicking Vault opens the project vault tab and activates it', async () => {
    // given
    const activate = vi.fn();
    const openVault = vi.fn(() => Promise.resolve(tab('vault-BEAR', 'BEAR', 'vault', null)));
    fakeMaple({ tabs: { openVault } });
    useMaple.setState({ config: VAULT_CONFIG, activate });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Vault' }));
    // then
    expect(openVault).toHaveBeenCalledWith('BEAR');
    expect(activate).toHaveBeenCalledWith('vault-BEAR');
  });

  test('clicking Vault activates an open vault tab without opening another', async () => {
    // given
    const activate = vi.fn();
    const openVault = vi.fn();
    fakeMaple({ tabs: { openVault } });
    useMaple.setState({
      config: VAULT_CONFIG,
      activate,
      tabs: [...useMaple.getState().tabs, tab('v1', 'BEAR', 'vault', null), tab('v2', 'DIG', 'vault', null)],
    });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Vault' }));
    // then
    expect(activate).toHaveBeenCalledWith('v1');
    expect(openVault).not.toHaveBeenCalled();
  });

  test('an open vault tab shows its dot and a close button', async () => {
    // given
    const close = vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false }));
    fakeMaple({ tabs: { close } });
    useMaple.setState({
      config: VAULT_CONFIG,
      activeTabId: 'v1',
      tabs: [...useMaple.getState().tabs, tab('v1', 'BEAR', 'vault', null)],
      statuses: { v1: { tabId: 'v1', dot: 'working', sessionAlive: true, exitCode: null, resumeFailed: false } },
    });
    render(<TabBar />);
    const vault = screen.getByRole('tab', { name: 'Vault' });
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close Vault' }));
    // then
    expect(vault.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'working');
    expect(vault).toHaveAttribute('aria-selected', 'true');
    expect(close).toHaveBeenCalledWith('v1', false);
  });

  test('confirming close of a working vault tab names it Vault', async () => {
    // given
    fakeMaple({ tabs: { close: () => Promise.resolve({ closed: false, needsConfirm: true }) } });
    useMaple.setState({ config: VAULT_CONFIG, tabs: [...useMaple.getState().tabs, tab('v1', 'BEAR', 'vault', null)] });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close Vault' }));
    // then
    expect(await screen.findByRole('dialog')).toHaveTextContent('Vault is still working. Close anyway?');
  });

  test('clicking Vault again clears the failure', async () => {
    // given
    const openVault = vi
      .fn()
      .mockRejectedValueOnce(new Error('opening vault: no vaultDir in config'))
      .mockResolvedValueOnce(tab('vault-BEAR', 'BEAR', 'vault', null));
    fakeMaple({ tabs: { openVault } });
    useMaple.setState({ config: VAULT_CONFIG, activate: vi.fn() });
    render(<TabBar />);
    await userEvent.click(screen.getByRole('tab', { name: 'Vault' }));
    await screen.findByRole('alert');
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Vault' }));
    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows why the vault tab failed to open', async () => {
    // given
    const activate = vi.fn();
    const openVault = vi.fn(() =>
      Promise.reject(
        new Error("Error invoking remote method 'tabs:openVault': Error: opening vault: no vaultDir in config"),
      ),
    );
    fakeMaple({ tabs: { openVault } });
    useMaple.setState({ config: VAULT_CONFIG, activate });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'Vault' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(/^opening vault: no vaultDir in config$/);
    expect(activate).not.toHaveBeenCalled();
  });

  test.each([
    { activeTabId: null, selected: 'Home' },
    { activeTabId: 't2', selected: 'BEAR-2' },
  ])('marks $selected as the selected tab', ({ activeTabId, selected }) => {
    // given
    useMaple.setState({ activeTabId });
    // when
    render(<TabBar />);
    // then
    const marked = screen.getAllByRole('tab', { selected: true }).map((t) => t.textContent);
    expect(marked).toEqual([selected]);
  });

  test('clicking a tab activates it', async () => {
    // given
    const activate = vi.fn();
    useMaple.setState({ activate });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'BEAR-2' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Home' }));
    // then
    expect(activate.mock.calls).toEqual([['t2'], [null]]);
  });

  test('shows each tab status as a dot', () => {
    // given
    useMaple.setState({
      statuses: { t2: { tabId: 't2', dot: 'waiting', sessionAlive: true, exitCode: null, resumeFailed: false } },
    });
    // when
    render(<TabBar />);
    // then
    const dot = screen.getByRole('tab', { name: 'BEAR-2' }).querySelector('[data-dot]');
    expect(dot).toHaveAttribute('data-dot', 'waiting');
  });

  test('shows no dot on Home or on a tab without a status', () => {
    // given
    useMaple.setState({
      statuses: { t2: { tabId: 't2', dot: 'ready', sessionAlive: true, exitCode: null, resumeFailed: false } },
    });
    // when
    render(<TabBar />);
    // then
    const dots = screen.getAllByRole('tab').map((t) => t.querySelector('[data-dot]')?.getAttribute('data-dot') ?? null);
    expect(dots).toEqual([null, null, 'ready']);
  });

  test('shows a close button beside each card tab only', () => {
    // given
    render(<TabBar />);
    // when
    const buttons = screen.getAllByRole('button', { name: /^Close / }).map((b) => b.getAttribute('aria-label'));
    // then
    expect(buttons).toEqual(['Close BEAR-1', 'Close BEAR-2']);
  });

  test('closing an idle tab closes it without asking', async () => {
    // given
    const close = vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false }));
    fakeMaple({ tabs: { close } });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close BEAR-2' }));
    // then
    expect(close).toHaveBeenCalledWith('t2', false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test.each([
    {
      choice: 'Close',
      calls: [
        ['t2', false],
        ['t2', true],
      ],
    },
    { choice: 'Cancel', calls: [['t2', false]] },
  ])('choosing $choice when a working tab asks to confirm', async ({ choice, calls }) => {
    // given
    const close = vi.fn((_id: string, force: boolean) => Promise.resolve({ closed: force, needsConfirm: !force }));
    fakeMaple({ tabs: { close } });
    render(<TabBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Close BEAR-2' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('BEAR-2 is still working. Close anyway?');
    // when
    await userEvent.click(within(dialog).getByRole('button', { name: choice }));
    // then
    expect(close.mock.calls).toEqual(calls);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closing a tab does not activate it', async () => {
    // given
    const activate = vi.fn();
    useMaple.setState({ activate });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close BEAR-2' }));
    // then
    expect(activate).not.toHaveBeenCalled();
  });

  test('Report opens the report form', async () => {
    // given
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    // then
    expect(screen.getByRole('dialog', { name: 'Report a bug or feature' })).toBeInTheDocument();
  });
});
