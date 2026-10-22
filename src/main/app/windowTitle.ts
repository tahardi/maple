import { basename, dirname } from 'node:path';

export function windowTitle(env: NodeJS.ProcessEnv): string {
  const dir = env.MAPLE_CONFIG_DIR;
  if (!dir) {
    return 'Maple';
  }
  if (basename(dir) === '.maple-try') {
    return `Maple (try: ${basename(dirname(dir))})`;
  }
  return `Maple (config: ${dir})`;
}
