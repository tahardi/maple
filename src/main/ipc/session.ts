import { z } from 'zod';
import { send, type IpcDeps } from './index';
import { handle, on, sizeArg, tabIdArg } from './validated';

export function registerSession({ sessions, window }: IpcDeps): void {
  on('session:write', z.tuple([tabIdArg, z.string()]), (tabId, data) => {
    sessions.write(tabId, data);
  });
  on('session:resize', z.tuple([tabIdArg, sizeArg, sizeArg]), (tabId, cols, rows) => {
    sessions.resize(tabId, cols, rows);
  });
  on('session:sendPrompt', z.tuple([tabIdArg, z.string()]), (tabId, text) => {
    sessions.sendPrompt(tabId, text);
  });
  handle('session:backlog', z.tuple([tabIdArg]), (tabId) => sessions.backlog(tabId));
  sessions.on('data', (tabId, data) => {
    send(window(), `session:data:${tabId}`, data);
  });
  sessions.on('batch', (projectKey, keys) => {
    send(window(), `session:batch:${projectKey}`, keys);
  });
}
