import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { writeHooksFile } from './hooksFile';

type Hooks = { hooks: Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]> };

describe('writeHooksFile', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-hooks-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writes the three hooks with quoted exec and script paths', async () => {
    // given
    const execPath = '/opt/Maple/maple';
    const scriptPath = '/opt/Maple/resources/maple-hook.mjs';
    // when
    const path = await writeHooksFile(dir, execPath, scriptPath);
    // then
    expect(path).toBe(join(dir, 'hooksFile.json'));
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Hooks;
    expect(Object.keys(parsed.hooks).sort()).toEqual(['Notification', 'Stop', 'UserPromptSubmit']);
    for (const [event, groups] of Object.entries(parsed.hooks)) {
      expect(groups[0].hooks[0]).toEqual({
        type: 'command',
        command: `ELECTRON_RUN_AS_NODE=1 '${execPath}' '${scriptPath}' ${event}`,
      });
    }
    expect(parsed.hooks.Notification[0].matcher).toBe('permission_prompt');
  });

  test('escapes single quotes in paths', async () => {
    // given
    const execPath = "/home/o'neil/maple";
    const scriptPath = "/home/o'neil/maple-hook.mjs";
    // when
    const path = await writeHooksFile(dir, execPath, scriptPath);
    // then
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Hooks;
    const command = parsed.hooks.Stop[0].hooks[0].command;
    expect(command).toBe(`ELECTRON_RUN_AS_NODE=1 '/home/o'\\''neil/maple' '/home/o'\\''neil/maple-hook.mjs' Stop`);
    expect(
      execFileSync('sh', ['-c', `set -- ${command.replace('ELECTRON_RUN_AS_NODE=1 ', '')}; printf '%s\\n' "$@"`], {
        encoding: 'utf8',
      }),
    ).toBe(`${execPath}\n${scriptPath}\nStop\n`);
  });

  test('creates the config dir when it is missing', async () => {
    // given
    const missing = join(dir, 'nested', 'maple');
    // when
    const path = await writeHooksFile(missing, '/maple', '/s.mjs');
    // then
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty('hooks.Stop');
  });
});
