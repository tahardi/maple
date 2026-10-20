import { z } from 'zod';
import { send, type IpcDeps } from './index';
import { handle, on, sizeArg, tabIdArg } from './validated';

export function registerTerminal({ sessions, terminals, project, window }: IpcDeps): void {
  handle('terminal:open', z.tuple([tabIdArg]), async (tabId) => {
    const tab = sessions.get(tabId);
    if (tab === null) {
      throw new Error(`opening terminal: unknown tab ${tabId}`);
    }
    const cwd = tab.worktreePath ?? (await project(tab.projectKey))?.plannerDir;
    if (cwd === undefined) {
      throw new Error(`opening terminal: unknown project ${tab.projectKey}`);
    }
    terminals.open(tabId, cwd);
  });
  on('terminal:write', z.tuple([tabIdArg, z.string()]), (tabId, data) => {
    terminals.write(tabId, data);
  });
  on('terminal:resize', z.tuple([tabIdArg, sizeArg, sizeArg]), (tabId, cols, rows) => {
    terminals.resize(tabId, cols, rows);
  });
  handle('terminal:backlog', z.tuple([tabIdArg]), (tabId) => terminals.backlog(tabId));
  terminals.on('data', (tabId, data) => {
    send(window(), `terminal:data:${tabId}`, data);
  });
  terminals.on('exit', (tabId, code) => {
    send(window(), `terminal:exit:${tabId}`, code);
  });
}
