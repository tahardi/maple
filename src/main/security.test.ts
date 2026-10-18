import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { lockDown, webPreferences } from './security';

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn(() => Promise.resolve()) }));

vi.mock('electron', () => ({ shell: { openExternal } }));

type OpenHandler = (details: { url: string }) => { action: string };

function fakeContents() {
  let openHandler: OpenHandler = () => ({ action: 'allow' });
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: (handler: OpenHandler) => {
      openHandler = handler;
    },
  });
  lockDown(contents as unknown as WebContents, 'file:///opt/maple/renderer/index.html');
  return {
    open: (url: string) => openHandler({ url }),
    navigate: (event: 'will-navigate' | 'will-redirect', url: string) => {
      const preventDefault = vi.fn();
      contents.emit(event, { preventDefault, url });
      return preventDefault;
    },
  };
}

describe('webPreferences', () => {
  test.each([
    { packaged: true, devTools: false },
    { packaged: false, devTools: true },
  ])(
    'isolates and sandboxes the renderer with devTools $devTools when packaged is $packaged',
    ({ packaged, devTools }) => {
      // given
      const preload = '/opt/maple/preload/index.cjs';
      // when
      const prefs = webPreferences(preload, packaged);
      // then
      expect(prefs).toEqual({
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools,
      });
    },
  );
});

describe('lockDown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    { url: 'https://example.atlassian.net/browse/MPL-1', external: true },
    { url: 'http://localhost:3000/', external: true },
    { url: 'file:///etc/passwd', external: false },
    { url: 'javascript:alert(1)', external: false },
    { url: 'smb://evil/share', external: false },
    { url: 'not a url', external: false },
  ])('denies a new window for $url and opens it externally: $external', ({ url, external }) => {
    // given
    const contents = fakeContents();
    // when
    const result = contents.open(url);
    // then
    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledTimes(external ? 1 : 0);
  });

  test.each([
    { event: 'will-navigate', url: 'https://evil.example/', prevented: true },
    { event: 'will-navigate', url: 'file:///home/me/wts/x/evil.html', prevented: true },
    { event: 'will-redirect', url: 'https://evil.example/', prevented: true },
    { event: 'will-navigate', url: 'file:///opt/maple/renderer/index.html', prevented: false },
    { event: 'will-navigate', url: 'file:///opt/maple/renderer/index.html#card', prevented: false },
  ] as const)('$event to $url is prevented: $prevented', ({ event, url, prevented }) => {
    // given
    const contents = fakeContents();
    // when
    const preventDefault = contents.navigate(event, url);
    // then
    expect(preventDefault).toHaveBeenCalledTimes(prevented ? 1 : 0);
  });
});
