import { z } from 'zod';
import type { IpcDeps } from './index';
import { emit } from './emit';
import { sizeArg, tabIdArg } from './args';
import { handle } from './handle';
import { on } from './on';

export function registerSession({ sessions, window }: IpcDeps): void {
  on('session', 'write', z.tuple([tabIdArg, z.string()]), (tabId, data) => {
    sessions.write(tabId, data);
  });
  on('session', 'resize', z.tuple([tabIdArg, sizeArg, sizeArg]), (tabId, cols, rows) => {
    sessions.resize(tabId, cols, rows);
  });
  on('session', 'sendPrompt', z.tuple([tabIdArg, z.string()]), (tabId, text) => {
    sessions.sendPrompt(tabId, text);
  });
  handle('session', 'backlog', z.tuple([tabIdArg]), (tabId) => sessions.backlog(tabId));
  sessions.on('data', (tabId, data) => {
    emit(window(), 'session', 'onData', tabId, data);
  });
  sessions.on('batch', (projectKey, keys) => {
    emit(window(), 'session', 'onBatch', projectKey, keys);
  });
}
