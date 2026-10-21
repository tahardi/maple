import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { TerminalPane } from './TerminalPane';

vi.mock('./TerminalView', () => ({
  TerminalView: ({ terminalId, hidden }: { terminalId: string; hidden?: boolean }) => (
    <div data-testid="view" data-terminal={terminalId} hidden={hidden} />
  ),
}));

function views() {
  return screen.getAllByTestId('view').map((v) => ({ id: v.dataset.terminal, hidden: v.hidden }));
}

function strip() {
  return screen
    .getAllByRole('button', { name: /^\d+$/ })
    .map((b) => ({ name: b.textContent, pressed: b.getAttribute('aria-pressed') }));
}

describe('TerminalPane', () => {
  test('starts with one terminal named after the tab and no close button', () => {
    // given
    fakeMaple();
    // when
    render(<TerminalPane tabId="tab-1" />);
    // then
    expect(views()).toEqual([{ id: 'tab-1', hidden: false }]);
    expect(strip()).toEqual([{ name: '1', pressed: 'true' }]);
    expect(screen.queryByRole('button', { name: /^Close terminal/ })).not.toBeInTheDocument();
  });

  test('+ adds a terminal and shows it', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    // then
    expect(views()).toEqual([
      { id: 'tab-1', hidden: true },
      { id: 'tab-1:2', hidden: false },
    ]);
    expect(strip()).toEqual([
      { name: '1', pressed: 'false' },
      { name: '2', pressed: 'true' },
    ]);
  });

  test('clicking a terminal in the strip shows it', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    // then
    expect(views()).toEqual([
      { id: 'tab-1', hidden: false },
      { id: 'tab-1:2', hidden: true },
    ]);
    expect(strip()).toEqual([
      { name: '1', pressed: 'true' },
      { name: '2', pressed: 'false' },
    ]);
  });

  test('× closes that terminal and shows its neighbor', async () => {
    // given
    const close = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { close } });
    render(<TerminalPane tabId="tab-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close terminal 2' }));
    // then
    expect(close).toHaveBeenCalledWith('tab-1:2');
    expect(views()).toEqual([{ id: 'tab-1', hidden: false }]);
    expect(strip()).toEqual([{ name: '1', pressed: 'true' }]);
  });

  test.each([
    { name: 'the first while it is shown', show: '1', close: 'tab-1', views: ['tab-1:2', 'tab-1:3'], shown: 'tab-1:2' },
    { name: 'one that is not shown', show: null, close: 'tab-1:2', views: ['tab-1', 'tab-1:3'], shown: 'tab-1:3' },
    { name: 'the middle while it is shown', show: '2', close: 'tab-1:2', views: ['tab-1', 'tab-1:3'], shown: 'tab-1' },
    { name: 'the last while it is shown', show: '3', close: 'tab-1:3', views: ['tab-1', 'tab-1:2'], shown: 'tab-1:2' },
  ])('× on $name of three terminals', async ({ show, close, views: want, shown }) => {
    // given
    const closeFn = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { close: closeFn } });
    render(<TerminalPane tabId="tab-1" />);
    const add = screen.getByRole('button', { name: 'New terminal' });
    await userEvent.click(add);
    await userEvent.click(add);
    if (show !== null) {
      await userEvent.click(screen.getByRole('button', { name: show }));
    }
    const label = close === 'tab-1' ? '1' : close.slice('tab-1:'.length);
    // when
    await userEvent.click(screen.getByRole('button', { name: `Close terminal ${label}` }));
    // then
    expect(closeFn).toHaveBeenCalledWith(close);
    expect(views().map((v) => v.id)).toEqual(want);
    expect(
      views()
        .filter((v) => !v.hidden)
        .map((v) => v.id),
    ).toEqual([shown]);
  });

  test('numbers keep counting after a close', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" />);
    const add = screen.getByRole('button', { name: 'New terminal' });
    await userEvent.click(add);
    await userEvent.click(screen.getByRole('button', { name: 'Close terminal 2' }));
    // when
    await userEvent.click(add);
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1', 'tab-1:3']);
    expect(strip().map((b) => b.name)).toEqual(['1', '3']);
  });
});
