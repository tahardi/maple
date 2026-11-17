import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
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
  return Array.from(document.querySelectorAll('button[aria-pressed]')).map((b) => ({
    name: b.textContent,
    pressed: b.getAttribute('aria-pressed'),
  }));
}

describe('TerminalPane', () => {
  test('starts with one terminal named after the tab and no close button', () => {
    // given
    fakeMaple();
    // when
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    // then
    expect(views()).toEqual([{ id: 'tab-1', hidden: false }]);
    expect(strip()).toEqual([{ name: '1', pressed: 'true' }]);
    expect(screen.queryByRole('button', { name: /^Close terminal/ })).not.toBeInTheDocument();
  });

  test('+ adds a terminal and shows it', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
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
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
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
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
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
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
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
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    const add = screen.getByRole('button', { name: 'New terminal' });
    await userEvent.click(add);
    await userEvent.click(screen.getByRole('button', { name: 'Close terminal 2' }));
    // when
    await userEvent.click(add);
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1', 'tab-1:3']);
    expect(strip().map((b) => b.name)).toEqual(['1', '3']);
  });

  test.each([
    { name: 'Enter saves the name', text: 'server', key: '{Enter}', want: ['1', 'server'] },
    { name: 'Escape keeps the old label', text: 'server', key: '{Escape}', want: ['1', '2'] },
    { name: 'Enter on a blank name shows the number', text: '   ', key: '{Enter}', want: ['1', '2'] },
    { name: 'blur saves the name', text: 'logs', key: 'blur', want: ['1', 'logs'] },
    { name: 'Enter trims spaces around the name', text: '  server  ', key: '{Enter}', want: ['1', 'server'] },
  ])('double-click then $name', async ({ text, key, want }) => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    await userEvent.dblClick(screen.getByRole('button', { name: '2' }));
    const input = screen.getByRole('textbox', { name: 'Terminal name' });
    await userEvent.clear(input);
    await userEvent.type(input, text);
    // when
    if (key === 'blur') {
      await userEvent.click(screen.getByRole('button', { name: '1' }));
    } else {
      await userEvent.keyboard(key);
    }
    // then
    expect(strip().map((b) => b.name)).toEqual(want);
    expect(screen.queryByRole('textbox', { name: 'Terminal name' })).not.toBeInTheDocument();
  });

  test('a renamed terminal keeps its name when shown and its close button uses it', async () => {
    // given
    const close = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { close } });
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    await userEvent.dblClick(screen.getByRole('button', { name: '2' }));
    const input = screen.getByRole('textbox', { name: 'Terminal name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'server{Enter}');
    // when
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    await userEvent.click(screen.getByRole('button', { name: 'server' }));
    // then
    expect(
      views()
        .filter((v) => !v.hidden)
        .map((v) => v.id),
    ).toEqual(['tab-1:2']);
    await userEvent.click(screen.getByRole('button', { name: 'Close terminal server' }));
    expect(close).toHaveBeenCalledWith('tab-1:2');
  });

  test('double-click selects the current label for editing', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    // when
    await userEvent.dblClick(screen.getByRole('button', { name: '1' }));
    // then
    const input = screen.getByRole('textbox', { name: 'Terminal name' });
    expect(input).toHaveValue('1');
    expect(input).toHaveFocus();
    expect(input).toHaveProperty('selectionStart', 0);
    expect(input).toHaveProperty('selectionEnd', 1);
  });

  test('a renamed terminal starts its next edit from its name', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    await userEvent.dblClick(screen.getByRole('button', { name: '1' }));
    const input = screen.getByRole('textbox', { name: 'Terminal name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'server{Enter}');
    // when
    await userEvent.dblClick(screen.getByRole('button', { name: 'server' }));
    // then
    expect(screen.getByRole('textbox', { name: 'Terminal name' })).toHaveValue('server');
    await userEvent.keyboard('{Escape}');
    expect(strip().map((b) => b.name)).toEqual(['server']);
  });

  test('blur saves a rename that follows a cancelled one', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    await userEvent.dblClick(screen.getByRole('button', { name: '2' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.dblClick(screen.getByRole('button', { name: '2' }));
    const input = screen.getByRole('textbox', { name: 'Terminal name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'logs');
    // when
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    // then
    expect(strip().map((b) => b.name)).toEqual(['1', 'logs']);
  });

  test('has no make try button in the strip', () => {
    // given
    fakeMaple();
    // when
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    // then
    expect(screen.queryByRole('button', { name: 'Run make try' })).not.toBeInTheDocument();
  });

  test('make try opens a terminal named make try and runs it once the shell is open', async () => {
    // given
    let finishOpen: () => void = () => undefined;
    const open = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishOpen = resolve;
        }),
    );
    const write = vi.fn();
    fakeMaple({ terminal: { open, write } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={0} />);
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    // then
    expect(views()).toEqual([
      { id: 'tab-1', hidden: true },
      { id: 'tab-1:2', hidden: false },
    ]);
    expect(strip()).toEqual([
      { name: '1', pressed: 'false' },
      { name: 'make try', pressed: 'true' },
    ]);
    expect(open).toHaveBeenCalledWith('tab-1', 'tab-1:2');
    expect(write).not.toHaveBeenCalled();
    // when
    finishOpen();
    // then
    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(1);
    });
    expect(write).toHaveBeenCalledWith('tab-1:2', 'make try\r');
  });

  test('a pane that mounts with a make try request runs it', async () => {
    // given
    const write = vi.fn();
    fakeMaple({ terminal: { write } });
    // when
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    // then
    expect(strip().map((b) => b.name)).toEqual(['1', 'make try']);
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith('tab-1:2', 'make try\r');
    });
  });

  test('the make try terminal takes the next number', async () => {
    // given
    fakeMaple();
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1', 'tab-1:2', 'tab-1:3']);
    expect(strip().map((b) => b.name)).toEqual(['1', 'make try', '3']);
  });

  test('make try shows the open make try terminal instead of opening another', async () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    const write = vi.fn();
    fakeMaple({ terminal: { open, write } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={2} />);
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1', 'tab-1:2', 'tab-1:3']);
    expect(
      views()
        .filter((v) => !v.hidden)
        .map((v) => v.id),
    ).toEqual(['tab-1:2']);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('tab-1', 'tab-1:2');
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('a rerender without a new make try request runs nothing', async () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { open } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close terminal make try' }));
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1']);
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('make try opens a new terminal after the old one is closed', async () => {
    // given
    const write = vi.fn();
    fakeMaple({ terminal: { write } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close terminal make try' }));
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={2} />);
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1', 'tab-1:3']);
    expect(strip().map((b) => b.name)).toEqual(['1', 'make try']);
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith('tab-1:3', 'make try\r');
    });
  });

  test('make try opens a new terminal after the old one is renamed', async () => {
    // given
    const write = vi.fn();
    fakeMaple({ terminal: { write } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    await userEvent.dblClick(screen.getByRole('button', { name: 'make try' }));
    const input = screen.getByRole('textbox', { name: 'Terminal name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'server{Enter}');
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={2} />);
    // then
    expect(strip().map((b) => b.name)).toEqual(['1', 'server', 'make try']);
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith('tab-1:3', 'make try\r');
    });
  });

  test('a make try terminal whose shell fails to open is removed and the reason is shown', async () => {
    // given
    const open = vi.fn(() =>
      Promise.reject(
        new Error("Error invoking remote method 'terminal:open': Error: opening terminal: unknown tab tab-1"),
      ),
    );
    const write = vi.fn();
    fakeMaple({ terminal: { open, write } });
    // when
    render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'make try did not start: opening terminal: unknown tab tab-1',
    );
    expect(views()).toEqual([{ id: 'tab-1', hidden: false }]);
    expect(strip()).toEqual([{ name: '1', pressed: 'true' }]);
    expect(write).not.toHaveBeenCalled();
  });

  test('make try after a failure clears the reason and opens a fresh terminal', async () => {
    // given
    const open = vi
      .fn<(tabId: string, terminalId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('opening terminal: no shell'))
      .mockResolvedValue(undefined);
    const write = vi.fn();
    fakeMaple({ terminal: { open, write } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    await screen.findByRole('alert');
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={2} />);
    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(strip().map((b) => b.name)).toEqual(['1', 'make try']);
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith('tab-1:3', 'make try\r');
    });
  });

  test('make try after a repo switch opens a new make try terminal in the selected repo', async () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    const write = vi.fn();
    fakeMaple({ terminal: { open, write } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith('tab-1:2', 'make try\r');
    });
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/b" tryRuns={2} />);
    // then
    expect(views().map((v) => v.id)).toEqual(['tab-1', 'tab-1:2', 'tab-1:3']);
    expect(open).toHaveBeenLastCalledWith('tab-1', 'tab-1:3');
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith('tab-1:3', 'make try\r');
    });
  });

  test('make try after switching back shows the make try terminal of that repo', () => {
    // given
    const open = vi.fn(() => Promise.resolve());
    fakeMaple({ terminal: { open } });
    const { rerender } = render(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={1} />);
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/b" tryRuns={2} />);
    // when
    rerender(<TerminalPane tabId="tab-1" worktreePath="/wts/a" tryRuns={3} />);
    // then
    expect(open).toHaveBeenCalledTimes(2);
    expect(
      views()
        .filter((v) => !v.hidden)
        .map((v) => v.id),
    ).toEqual(['tab-1:2']);
  });
});
