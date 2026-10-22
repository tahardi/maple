import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function writeHooksFile(dir: string, execPath: string, scriptPath: string): Promise<string> {
  const cmd = `ELECTRON_RUN_AS_NODE=1 ${quote(execPath)} ${quote(scriptPath)}`;
  const hook = (event: string) => [{ type: 'command', command: `${cmd} ${event}` }];
  const content = {
    hooks: {
      Stop: [{ hooks: hook('Stop') }],
      UserPromptSubmit: [{ hooks: hook('UserPromptSubmit') }],
      Notification: [{ matcher: 'permission_prompt', hooks: hook('Notification') }],
    },
  };
  const path = join(dir, 'hooksFile.json');
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(content, null, 2));
  return path;
}
