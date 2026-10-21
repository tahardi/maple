import { z } from 'zod';
import { send, type IpcDeps } from './index';
import { handle, on, sizeArg, tabIdArg } from './validated';

export function registerTerminal({ sessions, terminals, project, window }: IpcDeps): void {
  handle('terminal:open', z.tuple([tabIdArg, tabIdArg]), async (tabId, terminalId) => {
    if (terminalId !== tabId && !terminalId.startsWith(`${tabId}:`)) {
      throw new Error(`opening terminal: ${terminalId} is not a terminal of ${tabId}`);
    }
    const tab = sessions.get(tabId);
    if (tab === null) {
      throw new Error(`opening terminal: unknown tab ${tabId}`);
    }
    const cwd = tab.worktreePath ?? (await project(tab.projectKey))?.plannerDir;
    if (cwd === undefined) {
      throw new Error(`opening terminal: unknown project ${tab.projectKey}`);
    }
    terminals.open(terminalId, cwd);
  });
  handle('terminal:close', z.tuple([tabIdArg]), (terminalId) => {
    terminals.close(terminalId);
  });
  on('terminal:write', z.tuple([tabIdArg, z.string()]), (terminalId, data) => {
    terminals.write(terminalId, data);
  });
  on('terminal:resize', z.tuple([tabIdArg, sizeArg, sizeArg]), (terminalId, cols, rows) => {
    terminals.resize(terminalId, cols, rows);
  });
  handle('terminal:backlog', z.tuple([tabIdArg]), (terminalId) => terminals.backlog(terminalId));
  terminals.on('data', (terminalId, data) => {
    send(window(), `terminal:data:${terminalId}`, data);
  });
  terminals.on('exit', (terminalId, code) => {
    send(window(), `terminal:exit:${terminalId}`, code);
  });
}
