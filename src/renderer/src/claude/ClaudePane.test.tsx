import type { TabStatus } from '@shared/types';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { ClaudePane } from './ClaudePane';

const xterm = vi.hoisted(() => {
  const written: string[] = [];
  let typed: (data: string) => void = () => undefined;
  let keyHandler: (e: KeyboardEvent) => boolean = () => true;
  let wheelHandler: (e: WheelEvent) => boolean = () => true;
  const dispose = vi.fn();
  const paste = vi.fn();
  const stopTyping = vi.fn();
  const terminal = {
    cols: 80,
    rows: 24,
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn((data: string) => {
      written.push(data);
    }),
    onData: vi.fn((cb: (data: string) => void) => {
      typed = cb;
      return { dispose: stopTyping };
    }),
    attachCustomKeyEventHandler: vi.fn((cb: (e: KeyboardEvent) => boolean) => {
      keyHandler = cb;
    }),
    attachCustomWheelEventHandler: vi.fn((cb: (e: WheelEvent) => boolean) => {
      wheelHandler = cb;
    }),
    buffer: { active: { type: 'normal' } },
    modes: { mouseTrackingMode: 'none' },
    getSelection: vi.fn(() => 'selected'),
    paste,
    dispose,
  };
  return {
    written,
    terminal,
    dispose,
    paste,
    stopTyping,
    fit: vi.fn(),
    type: (data: string) => {
      typed(data);
    },
    key: (e: KeyboardEvent) => keyHandler(e),
    wheel: (e: WheelEvent) => wheelHandler(e),
  };
});

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function Terminal() {
    return xterm.terminal;
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function FitAddon() {
    return { fit: xterm.fit };
  }),
}));

let resize: () => void = () => undefined;
const disconnect = vi.fn();

function terminalHost(): HTMLElement {
  const host: unknown = vi.mocked(xterm.terminal.open).mock.calls[0]?.[0];
  if (!(host instanceof HTMLElement)) {
    throw new Error('finding the terminal host');
  }
  return host;
}

function flush() {
  return act(() => Promise.resolve());
}

describe('ClaudePane', () => {
  beforeEach(() => {
    xterm.written.length = 0;
    localStorage.clear();
    xterm.terminal.buffer.active.type = 'normal';
    xterm.terminal.modes.mouseTrackingMode = 'none';
    vi.clearAllMocks();
    useMaple.setState(useMaple.getInitialState(), true);
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver(cb: () => void) {
        resize = cb;
        return { observe: vi.fn(), disconnect };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('mounting writes the backlog, then data from onData, in order', async () => {
    // given
    let push: (data: string) => void = () => undefined;
    fakeMaple({
      session: {
        backlog: vi.fn(() => Promise.resolve('backlog')),
        onData: vi.fn((_tabId: string, cb: (data: string) => void) => {
          push = cb;
          return vi.fn();
        }),
      },
    });
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    push('live');
    // then
    expect(xterm.written).toEqual(['backlog', 'live']);
  });

  test('typed data reaches session.write with the tab id', async () => {
    // given
    const write = vi.fn();
    fakeMaple({ session: { write } });
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    // when
    xterm.type('\x03');
    // then
    expect(write).toHaveBeenCalledWith('t1', '\x03');
  });

  test('resizing fits the terminal and calls session.resize', async () => {
    // given
    const sessionResize = vi.fn();
    fakeMaple({ session: { resize: sessionResize } });
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    const host = terminalHost();
    vi.spyOn(host, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(host, 'clientHeight', 'get').mockReturnValue(480);
    // when
    resize();
    // then
    expect(xterm.fit).toHaveBeenCalled();
    expect(sessionResize).toHaveBeenCalledWith('t1', 80, 24);
  });

  test('does not resize the session while hidden', async () => {
    // given
    const sessionResize = vi.fn();
    fakeMaple({ session: { resize: sessionResize } });
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    const host = terminalHost();
    vi.spyOn(host, 'clientWidth', 'get').mockReturnValue(0);
    vi.spyOn(host, 'clientHeight', 'get').mockReturnValue(0);
    // when
    resize();
    // then
    expect(xterm.fit).not.toHaveBeenCalled();
    expect(sessionResize).not.toHaveBeenCalled();
  });

  test('unmount unsubscribes and disposes, but never closes the tab', async () => {
    // given
    const unsubscribe = vi.fn();
    const close = vi.fn(() => Promise.resolve({ closed: true, needsConfirm: false }));
    fakeMaple({ session: { onData: vi.fn(() => unsubscribe) }, tabs: { close } });
    const { unmount } = render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    // when
    unmount();
    // then
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(xterm.dispose).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  test('mounting opens a terminal with the pane font, scrollback, and dark theme', async () => {
    // given
    fakeMaple();
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    // then
    expect(Terminal).toHaveBeenCalledWith({
      fontFamily: "ui-monospace, 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace",
      fontSize: 13,
      scrollback: 10_000,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
    });
    expect(xterm.terminal.loadAddon).toHaveBeenCalledWith(vi.mocked(FitAddon).mock.results[0]?.value);
    expect(xterm.terminal.open).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  test('mounting reads the backlog and live data for its own tab', async () => {
    // given
    const backlog = vi.fn(() => Promise.resolve(''));
    const onData = vi.fn(() => vi.fn());
    fakeMaple({ session: { backlog, onData } });
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    // then
    expect(backlog).toHaveBeenCalledWith('t1');
    expect(onData).toHaveBeenCalledWith('t1', expect.any(Function));
  });

  test('unmount stops typing and resize forwarding', async () => {
    // given
    fakeMaple();
    const { unmount } = render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    // when
    unmount();
    // then
    expect(xterm.stopTyping).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  test('switching tabs replaces the terminal and subscribes to the new tab', async () => {
    // given
    const unsubscribe = vi.fn();
    const onData = vi.fn(() => unsubscribe);
    fakeMaple({ session: { onData } });
    const { rerender } = render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    // when
    rerender(<ClaudePane tabId="t2" actions={[]} />);
    await flush();
    // then
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(xterm.dispose).toHaveBeenCalledOnce();
    expect(Terminal).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith('t2', expect.any(Function));
  });

  test('unmount before the backlog arrives never subscribes', async () => {
    // given
    const onData = vi.fn(() => vi.fn());
    fakeMaple({ session: { onData } });
    const { unmount } = render(<ClaudePane tabId="t1" actions={[]} />);
    // when
    unmount();
    await flush();
    // then
    expect(onData).not.toHaveBeenCalled();
    expect(xterm.written).toEqual([]);
  });

  test.each([
    { name: 'Ctrl+Shift+C copies the selection', type: 'keydown', key: 'C', ctrl: true, shift: true, passed: false },
    { name: 'Ctrl+Shift+V pastes', type: 'keydown', key: 'V', ctrl: true, shift: true, passed: false },
    { name: 'Ctrl+C goes to the session', type: 'keydown', key: 'c', ctrl: true, shift: false, passed: true },
    { name: 'Ctrl+Shift+X goes to the session', type: 'keydown', key: 'X', ctrl: true, shift: true, passed: true },
    { name: 'Shift+C goes to the session', type: 'keydown', key: 'C', ctrl: false, shift: true, passed: true },
    { name: 'Ctrl+Shift+C keyup does not copy', type: 'keyup', key: 'C', ctrl: true, shift: true, passed: true },
  ])('$name', async ({ type, key, ctrl, shift, passed }) => {
    // given
    fakeMaple();
    const writeText = vi.fn(() => Promise.resolve());
    const readText = vi.fn(() => Promise.resolve('clip'));
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    const event = new KeyboardEvent(type, { key, ctrlKey: ctrl, shiftKey: shift });
    // when
    const result = xterm.key(event);
    await flush();
    // then
    expect(result).toBe(passed);
    const handled = !passed;
    expect(writeText.mock.calls).toEqual(handled && key === 'C' ? [['selected']] : []);
    expect(xterm.paste.mock.calls).toEqual(handled && key === 'V' ? [['clip']] : []);
  });

  async function wheelAt(clientX: number, clientY: number, deltaY: number) {
    const write = vi.fn();
    fakeMaple({ session: { write } });
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    const host = terminalHost();
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 800, 480));
    return { write, send: () => xterm.wheel(new WheelEvent('wheel', { deltaY, clientX, clientY })) };
  }

  test.each([
    { name: 'up in the alternate buffer', buffer: 'alternate', mode: 'vt200', deltaY: -100, report: '\x1b[<64;11;3M' },
    { name: 'down in the alternate buffer', buffer: 'alternate', mode: 'any', deltaY: 100, report: '\x1b[<65;11;3M' },
    { name: 'no mouse tracking', buffer: 'alternate', mode: 'none', deltaY: 100, report: null },
    { name: 'the normal buffer', buffer: 'normal', mode: 'vt200', deltaY: 100, report: null },
    { name: 'a sideways scroll', buffer: 'alternate', mode: 'vt200', deltaY: 0, report: null },
  ])('repeats wheel events while the app tracks the mouse: $name', async ({ buffer, mode, deltaY, report }) => {
    // given
    const { write, send } = await wheelAt(205, 95, deltaY);
    xterm.terminal.buffer.active.type = buffer;
    xterm.terminal.modes.mouseTrackingMode = mode;
    // when
    const passed = send();
    // then
    expect(passed).toBe(report === null);
    expect(write.mock.calls).toEqual(report === null ? [] : [['t1', report.repeat(3)]]);
  });

  test.each([
    { name: 'past the bottom right corner', clientX: 950, clientY: 600, report: '\x1b[<65;80;24M' },
    { name: 'past the top left corner', clientX: 50, clientY: 10, report: '\x1b[<65;1;1M' },
  ])('a wheel event $name reports a cell inside the terminal', async ({ clientX, clientY, report }) => {
    // given
    const { write, send } = await wheelAt(clientX, clientY, 100);
    xterm.terminal.buffer.active.type = 'alternate';
    xterm.terminal.modes.mouseTrackingMode = 'vt200';
    // when
    send();
    // then
    expect(write).toHaveBeenCalledWith('t1', report.repeat(3));
  });

  test('a wheel notch sends as many reports as the scroll speed control says', async () => {
    // given
    const { write, send } = await wheelAt(205, 95, 100);
    xterm.terminal.buffer.active.type = 'alternate';
    xterm.terminal.modes.mouseTrackingMode = 'vt200';
    fireEvent.change(screen.getByLabelText('Scroll speed'), { target: { value: '5' } });
    // when
    send();
    // then
    expect(write).toHaveBeenCalledWith('t1', '\x1b[<65;11;3M'.repeat(5));
  });

  test('shows the action bar', () => {
    // given
    fakeMaple();
    // when
    render(<ClaudePane tabId="t1" actions={[{ label: 'Approve', onClick: vi.fn() }]} />);
    // then
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  test.each([
    { sessionAlive: true, shown: false },
    { sessionAlive: false, shown: true },
  ])('sessionAlive $sessionAlive shows the overlay: $shown', ({ sessionAlive, shown }) => {
    // given
    fakeMaple();
    useMaple.setState({
      statuses: { t1: { tabId: 't1', dot: 'idle', sessionAlive, exitCode: 1, resumeFailed: false } },
    });
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    // then
    expect(screen.queryByText('Session ended (exit code 1)') !== null).toBe(shown);
  });

  test.each([
    { name: 'no status', statuses: {} },
    {
      name: 'another tab ended',
      statuses: { t2: { tabId: 't2', dot: 'idle', sessionAlive: false, exitCode: 1, resumeFailed: false } },
    },
  ] as { name: string; statuses: Record<string, TabStatus> }[])('$name shows no overlay', ({ statuses }) => {
    // given
    fakeMaple();
    useMaple.setState({ statuses });
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    // then
    expect(screen.queryByText(/Session ended/)).toBeNull();
  });

  test('the overlay appears when the session ends while mounted', () => {
    // given
    fakeMaple();
    useMaple.setState({
      statuses: { t1: { tabId: 't1', dot: 'working', sessionAlive: true, exitCode: null, resumeFailed: false } },
    });
    render(<ClaudePane tabId="t1" actions={[]} />);
    // when
    act(() => {
      useMaple
        .getState()
        .setStatus({ tabId: 't1', dot: 'idle', sessionAlive: false, exitCode: 137, resumeFailed: false });
    });
    // then
    expect(screen.getByText('Session ended (exit code 137)')).toBeInTheDocument();
  });

  test('a failed resume shows the resume failure overlay', () => {
    // given
    fakeMaple();
    useMaple.setState({
      statuses: { t1: { tabId: 't1', dot: 'idle', sessionAlive: false, exitCode: 1, resumeFailed: true } },
    });
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    // then
    expect(screen.getByText('Resume failed (exit code 1)')).toBeInTheDocument();
  });
});
