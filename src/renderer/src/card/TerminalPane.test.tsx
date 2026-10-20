import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { XtermIo } from '../claude/useXterm';
import { fakeMaple } from '../testing/fakeMaple';
import { TerminalPane } from './TerminalPane';

const captured = vi.hoisted(() => ({ io: null as XtermIo | null }));

vi.mock('../claude/useXterm', () => ({
  useXterm: (_host: unknown, io: XtermIo) => {
    captured.io = io;
  },
}));

describe('TerminalPane', () => {
  beforeEach(() => {
    captured.io = null;
  });

  test('mounting opens the tab shell', () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { open } });
    // when
    render(<TerminalPane tabId="tab-1" />);
    // then
    expect(open).toHaveBeenCalledWith('tab-1');
  });

  test('typed data goes to terminal.write', () => {
    // given
    const write = vi.fn();
    fakeMaple({ terminal: { write } });
    render(<TerminalPane tabId="tab-1" />);
    // when
    captured.io?.write('ls\r');
    // then
    expect(write).toHaveBeenCalledWith('tab-1', 'ls\r');
  });

  test('an exit shows the exit code and Restart opens the shell again', async () => {
    // given
    let exit: (code: number) => void = () => undefined;
    const open = vi.fn(() => Promise.resolve());
    fakeMaple({
      terminal: {
        open,
        onExit: vi.fn((_tabId: string, cb: (code: number) => void) => {
          exit = cb;
          return vi.fn();
        }),
      },
    });
    render(<TerminalPane tabId="tab-1" />);
    act(() => {
      exit(1);
    });
    expect(screen.getByText('Shell exited (code 1)')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    // then
    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Shell exited (code 1)')).not.toBeInTheDocument();
  });
});
