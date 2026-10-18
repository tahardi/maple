import type { MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { checkNotifications, setAppMenu } from './menu';

const { buildFromTemplate, setApplicationMenu, getApplicationMenu } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => template),
  setApplicationMenu: vi.fn(),
  getApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({ Menu: { buildFromTemplate, setApplicationMenu, getApplicationMenu } }));

function menuItems(): MenuItemConstructorOptions[] {
  const template = buildFromTemplate.mock.calls[0]?.[0] ?? [];
  return template.flatMap((top) => [top, ...(Array.isArray(top.submenu) ? top.submenu : [])]);
}

describe('setAppMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('adds a Reload config item that calls reload', () => {
    // given
    const reload = vi.fn(() => Promise.resolve());
    setAppMenu(reload, () => Promise.resolve());
    const item = menuItems().find((entry) => entry.label === 'Reload config');
    // when
    item?.click?.({} as never, undefined, {});
    // then
    expect(item?.accelerator).toBe('Ctrl+Shift+R');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(setApplicationMenu).toHaveBeenCalledTimes(1);
  });

  test('leaves out Force Reload so Ctrl+Shift+R stays free', () => {
    // given
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
    );
    // when
    const items = menuItems();
    // then
    expect(items.map((entry) => entry.role)).not.toContain('forceReload');
    expect(items.map((entry) => entry.role)).not.toContain('viewMenu');
  });

  test.each([true, false])('the Desktop notifications checkbox sets notifications to %s', (checked) => {
    // given
    const setNotifications = vi.fn(() => Promise.resolve());
    setAppMenu(() => Promise.resolve(), setNotifications);
    const item = menuItems().find((entry) => entry.label === 'Desktop notifications');
    // when
    item?.click?.({ checked } as never, undefined, {});
    // then
    expect(item?.type).toBe('checkbox');
    expect(setNotifications).toHaveBeenCalledWith(checked);
  });

  test('the Desktop notifications checkbox sits under Settings', () => {
    // given
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
    );
    // when
    const settings = buildFromTemplate.mock.calls[0]?.[0].find((top) => top.label === 'Settings');
    // then
    expect(Array.isArray(settings?.submenu) ? settings.submenu.map((item) => item.label) : []).toEqual([
      'Desktop notifications',
    ]);
  });
});

describe('checkNotifications', () => {
  test.each([true, false])('sets the checkbox to %s', (on) => {
    // given
    const item = { checked: !on };
    const getMenuItemById = vi.fn(() => item);
    getApplicationMenu.mockReturnValue({ getMenuItemById });
    // when
    checkNotifications(on);
    // then
    expect(getMenuItemById).toHaveBeenCalledWith('notifications');
    expect(item.checked).toBe(on);
  });

  test.each([
    { name: 'no menu', menu: null },
    { name: 'no checkbox', menu: { getMenuItemById: () => null } },
  ])('does nothing with $name', ({ menu }) => {
    // given
    getApplicationMenu.mockReturnValue(menu);
    // when
    const run = () => {
      checkNotifications(true);
    };
    // then
    expect(run).not.toThrow();
  });
});
