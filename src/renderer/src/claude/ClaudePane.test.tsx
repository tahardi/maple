import { act, render, screen } from '@testing-library/react';
import { useMaple } from '../store';
import { fakeMaple } from '../testing/fakeMaple';
import { ClaudePane } from './ClaudePane';

const xterm = vi.hoisted(() => {
  const written: string[] = [];
  let typed: (data: string) => void = () => undefined;
  let keyHandler: (e: KeyboardEvent) => boolean = () => true;
  const dispose = vi.fn();
  const paste = vi.fn();
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
      return { dispose: vi.fn() };
    }),
    attachCustomKeyEventHandler: vi.fn((cb: (e: KeyboardEvent) => boolean) => {
      keyHandler = cb;
    }),
    getSelection: vi.fn(() => 'selected'),
    paste,
    dispose,
  };
  return {
    written,
    terminal,
    dispose,
    paste,
    fit: vi.fn(),
    type: (data: string) => {
      typed(data);
    },
    key: (e: KeyboardEvent) => keyHandler(e),
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

function flush() {
  return act(() => Promise.resolve());
}

describe('ClaudePane', () => {
  beforeEach(() => {
    xterm.written.length = 0;
    vi.clearAllMocks();
    useMaple.setState(useMaple.getInitialState(), true);
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver(cb: () => void) {
        resize = cb;
        return { observe: vi.fn(), disconnect: vi.fn() };
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
    // when
    resize();
    // then
    expect(xterm.fit).toHaveBeenCalled();
    expect(sessionResize).toHaveBeenCalledWith('t1', 80, 24);
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
    { name: 'Ctrl+Shift+C copies the selection', key: 'C', passed: false },
    { name: 'Ctrl+Shift+V pastes', key: 'V', passed: false },
    { name: 'Ctrl+C goes to the session', key: 'c', passed: true },
  ])('$name', async ({ key, passed }) => {
    // given
    fakeMaple();
    const writeText = vi.fn(() => Promise.resolve());
    const readText = vi.fn(() => Promise.resolve('clip'));
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    render(<ClaudePane tabId="t1" actions={[]} />);
    await flush();
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey: key !== 'c' });
    // when
    const result = xterm.key(event);
    await flush();
    // then
    expect(result).toBe(passed);
    expect(writeText.mock.calls).toEqual(key === 'C' ? [['selected']] : []);
    expect(xterm.paste.mock.calls).toEqual(key === 'V' ? [['clip']] : []);
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
    useMaple.setState({ statuses: { t1: { tabId: 't1', dot: 'idle', sessionAlive, exitCode: 1 } } });
    // when
    render(<ClaudePane tabId="t1" actions={[]} />);
    // then
    expect(screen.queryByText('Session ended (exit code 1)') !== null).toBe(shown);
  });
});
