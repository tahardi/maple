import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { XtermIo } from '../claude/useXterm';
import { fakeMaple } from '../testing/fakeMaple';
import { TerminalView } from './TerminalView';

const captured = vi.hoisted(() => ({ io: null as XtermIo | null }));

vi.mock('../claude/useXterm', () => ({
  useXterm: (_host: unknown, io: XtermIo) => {
    captured.io = io;
  },
}));

describe('TerminalView', () => {
  beforeEach(() => {
    captured.io = null;
  });

  test('mounting opens the terminal in the tab', () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { open } });
    // when
    render(<TerminalView tabId="tab-1" terminalId="tab-1:2" />);
    // then
    expect(open).toHaveBeenCalledWith('tab-1', 'tab-1:2');
  });

  test('typed data goes to terminal.write', () => {
    // given
    const write = vi.fn();
    fakeMaple({ terminal: { write } });
    render(<TerminalView tabId="tab-1" terminalId="tab-1:2" />);
    // when
    captured.io?.write('ls\r');
    // then
    expect(write).toHaveBeenCalledWith('tab-1:2', 'ls\r');
  });

  test('resize, backlog, and live data use the terminal id', async () => {
    // given
    const resize = vi.fn();
    const backlog = vi.fn(() => Promise.resolve('old'));
    const onData = vi.fn(() => vi.fn());
    fakeMaple({ terminal: { resize, backlog, onData } });
    render(<TerminalView tabId="tab-1" terminalId="tab-1:2" />);
    const cb = vi.fn();
    // when
    captured.io?.resize(100, 30);
    const got = await captured.io?.backlog();
    captured.io?.onData(cb);
    // then
    expect(resize).toHaveBeenCalledWith('tab-1:2', 100, 30);
    expect(got).toBe('old');
    expect(backlog).toHaveBeenCalledWith('tab-1:2');
    expect(onData).toHaveBeenCalledWith('tab-1:2', cb);
  });

  test('unmount stops listening for exits', () => {
    // given
    const stop = vi.fn();
    const onExit = vi.fn(() => stop);
    fakeMaple({ terminal: { onExit } });
    const { unmount } = render(<TerminalView tabId="tab-1" terminalId="tab-1:2" />);
    // when
    unmount();
    // then
    expect(onExit).toHaveBeenCalledWith('tab-1:2', expect.any(Function));
    expect(stop).toHaveBeenCalledOnce();
  });

  test('an exit shows the exit code and Restart opens the shell again', async () => {
    // given
    let exit: (code: number) => void = () => undefined;
    const open = vi.fn(() => Promise.resolve());
    fakeMaple({
      terminal: {
        open,
        onExit: vi.fn((_terminalId: string, cb: (code: number) => void) => {
          exit = cb;
          return vi.fn();
        }),
      },
    });
    render(<TerminalView tabId="tab-1" terminalId="tab-1:2" />);
    act(() => {
      exit(1);
    });
    expect(screen.getByText('Shell exited (code 1)')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    // then
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith('tab-1', 'tab-1:2');
    expect(screen.queryByText('Shell exited (code 1)')).not.toBeInTheDocument();
  });
});
