import type { Runner as CommandRunner } from '@main/app/preflight';

export async function ghLogin(run: CommandRunner): Promise<string> {
  const { code, stdout, stderr } = await run('gh', ['api', 'user', '--jq', '.login'], '');
  if (code !== 0) {
    throw new Error(`reading gh login: ${stderr}`);
  }
  return stdout.trim();
}
