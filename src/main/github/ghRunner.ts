import { execFile } from 'node:child_process';
import type { Runner as CommandRunner } from '@main/app/preflight';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export function ghRunner(repo: string, run: typeof execFile = execFile): CommandRunner {
  return (cmd, args) =>
    new Promise((resolve) => {
      run(
        cmd,
        args,
        { env: { ...process.env, GH_REPO: repo }, maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          const code = !error ? 0 : error.code === 'ENOENT' ? 127 : typeof error.code === 'number' ? error.code : 1;
          resolve({ code, stdout, stderr });
        },
      );
    });
}
