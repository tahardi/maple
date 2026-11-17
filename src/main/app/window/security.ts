import { shell, type WebContents, type WebPreferences } from 'electron';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write']);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function withoutHash(url: string): string | null {
  const parsed = parse(url);
  if (parsed === null) {
    return null;
  }
  parsed.hash = '';
  return parsed.href;
}

export function webPreferences(preload: string, packaged: boolean): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: !packaged,
  };
}

export function lockDown(contents: WebContents, appUrl: string): void {
  const home = withoutHash(appUrl);
  contents.setWindowOpenHandler(({ url }) => {
    const parsed = parse(url);
    if (parsed !== null && EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      void shell.openExternal(parsed.href);
    }
    return { action: 'deny' };
  });
  const guard = (event: { preventDefault: () => void; url: string }) => {
    if (withoutHash(event.url) !== home) {
      event.preventDefault();
    }
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  contents.session.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission));
}
