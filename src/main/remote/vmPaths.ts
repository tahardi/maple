import { join } from 'node:path';

export function vmTmuxConf(home: string): string {
  return join(home, '.xena', 'maple-tmux.conf');
}

export function vmFindingsDir(home: string): string {
  return join(home, '.local', 'state', 'maple', 'findings');
}
