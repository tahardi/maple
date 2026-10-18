import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, test, vi } from 'vitest';
import { setAppMenu } from './menu';

const { buildFromTemplate, setApplicationMenu } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => template),
  setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({ Menu: { buildFromTemplate, setApplicationMenu } }));

function menuItems(): MenuItemConstructorOptions[] {
  const template = buildFromTemplate.mock.calls[0]?.[0] ?? [];
  return template.flatMap((top) => [top, ...(Array.isArray(top.submenu) ? top.submenu : [])]);
}

describe('setAppMenu', () => {
  test('adds a Reload config item that calls reload', () => {
    // given
    const reload = vi.fn(() => Promise.resolve());
    setAppMenu(reload);
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
    setAppMenu(() => Promise.resolve());
    // when
    const items = menuItems();
    // then
    expect(items.map((entry) => entry.role)).not.toContain('forceReload');
    expect(items.map((entry) => entry.role)).not.toContain('viewMenu');
  });
});
