import { LocalRunner } from './localRunner';
import type { Runner } from './runner';

const NO_VM = 'reaching the VM: Maple started without a remote block; add one and restart Maple';

export function fallbackRunner(env: NodeJS.ProcessEnv = process.env): Runner {
  if (env.MAPLE_LOCAL_RUNNER === '1') {
    return new LocalRunner();
  }

  const refuse = (): never => {
    throw new Error(NO_VM);
  };
  return {
    exec: () => Promise.reject(new Error(NO_VM)),
    spawnPty: refuse,
    readFile: () => Promise.reject(new Error(NO_VM)),
    follow: refuse,
  };
}
