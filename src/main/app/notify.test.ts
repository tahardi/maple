import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Dot, TabState } from '@shared/types/tabs';
import { notifyTab, shouldNotify } from './notify';

const { notifications } = vi.hoisted(() => ({
  notifications: [] as { options: { title: string; body: string }; shown: boolean; click: () => void }[],
}));

vi.mock('electron', () => ({
  Notification: class {
    private readonly record: (typeof notifications)[number];
    constructor(options: { title: string; body: string }) {
      this.record = { options, shown: false, click: () => undefined };
      notifications.push(this.record);
    }
    on(_event: 'click', cb: () => void) {
      this.record.click = cb;
    }
    show() {
      this.record.shown = true;
    }
  },
}));

const cardTab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-44',
  sessionId: 's1',
  worktreePath: null,
};

function fakeWindow(destroyed: boolean) {
  const win = {
    isDestroyed: () => destroyed,
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { send: vi.fn() },
  };
  return { win, asWindow: win as unknown as BrowserWindow };
}

describe('shouldNotify', () => {
  test.each<{
    name: string;
    dot: Dot;
    prev: Dot;
    focused: boolean;
    active: string | null;
    enabled: boolean;
    want: boolean;
  }>([
    {
      name: 'turning waiting while unfocused',
      dot: 'waiting',
      prev: 'working',
      focused: false,
      active: 't1',
      enabled: true,
      want: true,
    },
    {
      name: 'turning waiting on another tab',
      dot: 'waiting',
      prev: 'working',
      focused: true,
      active: 't2',
      enabled: true,
      want: true,
    },
    {
      name: 'turning waiting on Home',
      dot: 'waiting',
      prev: 'idle',
      focused: true,
      active: null,
      enabled: true,
      want: true,
    },
    {
      name: 'turning waiting on this tab',
      dot: 'waiting',
      prev: 'working',
      focused: true,
      active: 't1',
      enabled: true,
      want: false,
    },
    {
      name: 'already waiting',
      dot: 'waiting',
      prev: 'waiting',
      focused: false,
      active: null,
      enabled: true,
      want: false,
    },
    { name: 'disabled', dot: 'waiting', prev: 'working', focused: false, active: null, enabled: false, want: false },
    { name: 'turning ready', dot: 'ready', prev: 'working', focused: false, active: null, enabled: true, want: false },
    { name: 'turning idle', dot: 'idle', prev: 'waiting', focused: false, active: null, enabled: true, want: false },
  ])('$name', ({ dot, prev, focused, active, enabled, want }) => {
    // given
    const args = [dot, prev, focused, active, 't1', enabled] as const;
    // when
    const got = shouldNotify(...args);
    // then
    expect(got).toBe(want);
  });
});

describe('notifyTab', () => {
  beforeEach(() => {
    notifications.length = 0;
  });

  test.each<{ name: string; tab: TabState; title: string }>([
    { name: 'a card tab', tab: cardTab, title: 'DIG-44 needs you' },
    {
      name: 'a planner tab',
      tab: { ...cardTab, kind: 'planner', cardKey: null },
      title: 'Dig Days planner needs you',
    },
  ])('shows a notification for $name', ({ tab, title }) => {
    // given
    const { asWindow } = fakeWindow(false);
    // when
    notifyTab(() => asWindow, tab, 'Dig Days');
    // then
    expect(notifications).toEqual([
      { options: { title, body: 'Dig Days' }, shown: true, click: expect.any(Function) as unknown },
    ]);
  });

  test('clicking the notification focuses the window and activates the tab', () => {
    // given
    const { win, asWindow } = fakeWindow(false);
    notifyTab(() => asWindow, cardTab, 'Dig Days');
    // when
    notifications[0]?.click();
    // then
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('tabs:activate', 't1');
  });

  test.each([
    { name: 'no window', destroyed: null },
    { name: 'a destroyed window', destroyed: true },
  ])('clicking the notification with $name does nothing', ({ destroyed }) => {
    // given
    const { win, asWindow } = fakeWindow(destroyed ?? false);
    notifyTab(() => (destroyed === null ? null : asWindow), cardTab, 'Dig Days');
    // when
    notifications[0]?.click();
    // then
    expect(win.focus).not.toHaveBeenCalled();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});
