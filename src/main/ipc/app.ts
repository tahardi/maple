import { app } from 'electron';
import { dotSchema } from '@main/app/state/dotSchema';
import { z } from 'zod';
import type { IpcDeps } from './index';
import { emit } from './emit';
import { projectKeyArg, tabIdArg } from './args';
import { handle } from './handle';
import { on } from './on';

export function registerApp({
  setNotifications,
  warnings,
  setLastProject,
  lastProject,
  setSeen,
  seen,
  sessions,
  status,
  window,
}: IpcDeps): void {
  let confirmed = false;
  handle('app', 'setNotifications', z.tuple([z.boolean()]), (on) => setNotifications(on));
  handle('app', 'warnings', z.tuple([]), () => warnings());
  handle('app', 'setLastProject', z.tuple([projectKeyArg]), (key) => setLastProject(key));
  handle('app', 'lastProject', z.tuple([]), () => lastProject());
  handle('app', 'setSeen', z.tuple([z.record(tabIdArg, dotSchema)]), (map) => setSeen(map));
  handle('app', 'seen', z.tuple([]), () => seen());
  on('app', 'confirmQuit', z.tuple([]), () => {
    confirmed = true;
    app.quit();
  });
  app.on('before-quit', (event) => {
    const working = status
      .statuses()
      .filter((s) => s.dot === 'working')
      .flatMap((s) => sessions.get(s.tabId)?.cardKey ?? []);
    if (confirmed || working.length === 0) {
      return;
    }
    event.preventDefault();
    emit(window(), 'app', 'onQuitRequested', working);
  });
}
