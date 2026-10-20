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
