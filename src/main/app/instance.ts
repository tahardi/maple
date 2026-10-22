import { join } from 'node:path';
import type { App } from 'electron';
import { configDir } from './config';

export function claimInstance(app: Pick<App, 'setPath' | 'requestSingleInstanceLock'>): boolean {
  if (process.env.MAPLE_CONFIG_DIR) {
    app.setPath('userData', join(configDir(), 'electron'));
  }
  return app.requestSingleInstanceLock();
}
