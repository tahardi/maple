import type { MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { aboutDetail } from '@main/app/buildInfo';
import { checkNotifications, setAppMenu } from './menu';

const { buildFromTemplate, setApplicationMenu, getApplicationMenu, openPath, showMessageBox } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => template),
  setApplicationMenu: vi.fn(),
  getApplicationMenu: vi.fn(),
  openPath: vi.fn(() => Promise.resolve('')),
  showMessageBox: vi.fn(() => Promise.resolve({ response: 0, checkboxChecked: false })),
}));

vi.mock('electron', () => ({
  Menu: { buildFromTemplate, setApplicationMenu, getApplicationMenu },
  shell: { openPath },
  dialog: { showMessageBox },
  app: { getVersion: () => '0.1.0' },
}));

vi.mock('@main/app/buildInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@main/app/buildInfo')>()),
  readBuildInfo: vi.fn(() => Promise.resolve(BUILD)),
}));

const BUILD = { sha: 'abc1234', date: '2026-11-11T10:00:00.000Z' };

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
    setAppMenu(
      reload,
      () => Promise.resolve(),
      () => Promise.resolve(),
      vi.fn(),
    );
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
      () => Promise.resolve(),
      vi.fn(),
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
    setAppMenu(
      () => Promise.resolve(),
      setNotifications,
      () => Promise.resolve(),
      vi.fn(),
    );
    const item = menuItems().find((entry) => entry.label === 'Desktop notifications');
    // when
    item?.click?.({ checked } as never, undefined, {});
    // then
    expect(item?.type).toBe('checkbox');
    expect(setNotifications).toHaveBeenCalledWith(checked);
  });

  test.each([
    { label: 'Actual Size', accelerator: 'CommandOrControl+0', change: 'reset' },
    { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', change: 'in' },
    { label: 'Zoom Out', accelerator: 'CommandOrControl+-', change: 'out' },
  ])('View > $label zooms $change', ({ label, accelerator, change }) => {
    // given
    const setZoom = vi.fn(() => Promise.resolve());
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
      setZoom,
      vi.fn(),
    );
    const item = menuItems().find((entry) => entry.label === label);
    // when
    item?.click?.({} as never, undefined, {});
    // then
    expect(item?.accelerator).toBe(accelerator);
    expect(setZoom).toHaveBeenCalledWith(change);
  });

  test('Help > Open logs opens the logs folder', () => {
    // given
    vi.stubEnv('MAPLE_CONFIG_DIR', '/tmp/maple');
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.resolve(),
      vi.fn(),
    );
    const help = buildFromTemplate.mock.calls[0]?.[0].find((top) => top.label === 'Help');
    const item = Array.isArray(help?.submenu) ? help.submenu.find((entry) => entry.label === 'Open logs') : undefined;
    // when
    item?.click?.({} as never, undefined, {});
    // then
    expect(openPath).toHaveBeenCalledWith('/tmp/maple/logs');
    vi.unstubAllEnvs();
  });

  test('Help > Report a bug… asks for the report form', () => {
    // given
    const reportBug = vi.fn();
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.resolve(),
      reportBug,
    );
    const help = buildFromTemplate.mock.calls[0]?.[0].find((top) => top.label === 'Help');
    const labels = Array.isArray(help?.submenu) ? help.submenu.map((entry) => entry.label) : [];
    const item = menuItems().find((entry) => entry.label === 'Report a bug…');
    // when
    item?.click?.({} as never, undefined, {});
    // then
    expect(reportBug).toHaveBeenCalledOnce();
    expect(labels.indexOf('Report a bug…')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Report a bug…')).toBeLessThan(labels.indexOf('Open logs'));
  });

  test('Help > About Maple shows the version, commit, and build date', async () => {
    // given
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.resolve(),
      vi.fn(),
    );
    const help = buildFromTemplate.mock.calls[0]?.[0].find((top) => top.label === 'Help');
    const labels = Array.isArray(help?.submenu) ? help.submenu.map((entry) => entry.label) : [];
    const item = menuItems().find((entry) => entry.label === 'About Maple');
    // when
    item?.click?.({} as never, undefined, {});
    // then
    expect(labels).toContain('About Maple');
    await vi.waitFor(() => {
      expect(showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'About Maple', detail: aboutDetail('0.1.0', BUILD) }),
      );
    });
  });

  test('the Desktop notifications checkbox sits under Settings', () => {
    // given
    setAppMenu(
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.resolve(),
      vi.fn(),
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
