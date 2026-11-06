import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const script = join(import.meta.dirname, 'maple-hook.mjs');

function runHook(
  event: string,
  env: Record<string, string>,
  stdin: string,
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, event], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout });
    });
    child.stdin.end(stdin);
  });
}

function listen(socketPath: string, received: string[]): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received.push(chunk.toString());
      });
    });
    server.listen(socketPath, () => {
      resolve(server);
    });
  });
}

describe('maple-hook', () => {
  let dir = '';
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-hook-'));
  });

  afterEach(async () => {
    server?.close();
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  test('sends one event line to the socket and exits 0', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const received: string[] = [];
    server = await listen(socketPath, received);
    // when
    const result = await runHook(
      'Notification',
      { MAPLE_SOCKET: socketPath, MAPLE_TAB_ID: 'tab-1' },
      '{"notification_type":"permission_prompt"}',
    );
    // then
    expect(result).toEqual({ code: 0, stdout: '' });
    expect(received.join('')).toBe('{"tabId":"tab-1","event":"Notification","notificationType":"permission_prompt"}\n');
  });

  test('exits 0 within 1 second when the socket is missing', async () => {
    // given
    const start = Date.now();
    // when
    const result = await runHook(
      'Notification',
      { MAPLE_SOCKET: join(dir, 'missing.sock'), MAPLE_TAB_ID: 'tab-1' },
      '{}',
    );
    // then
    expect(result).toEqual({ code: 0, stdout: '' });
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('sends a null notification type when stdin is not JSON', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const received: string[] = [];
    server = await listen(socketPath, received);
    // when
    const result = await runHook('Stop', { MAPLE_SOCKET: socketPath, MAPLE_TAB_ID: 'tab-2' }, 'not json');
    // then
    expect(result).toEqual({ code: 0, stdout: '' });
    expect(received.join('')).toBe('{"tabId":"tab-2","event":"Stop","notificationType":null}\n');
  });

  describe('PreToolUse', () => {
    let vault = '';
    let snapshots = '';
    let env: Record<string, string> = {};

    const anchorhold = (path: string) =>
      JSON.stringify({ tool_name: 'mcp__anchorhold__anchorhold_write_note', tool_input: { path } });
    const edit = (file: string, tool = 'Edit') => JSON.stringify({ tool_name: tool, tool_input: { file_path: file } });

    beforeEach(async () => {
      vault = join(dir, 'vault');
      snapshots = join(dir, 'snapshots');
      env = { MAPLE_VAULT_DIR: vault, MAPLE_SNAPSHOT_DIR: snapshots };
      await mkdir(join(vault, 'Projects'), { recursive: true });
      await mkdir(snapshots);
      await writeFile(join(vault, 'Projects', 'Spike.md'), '# Before\n');
    });

    test.each([
      { name: 'a note anchorhold writes', stdin: () => anchorhold('Projects/Spike.md') },
      { name: 'a note anchorhold writes without .md', stdin: () => anchorhold('Projects/Spike') },
      { name: 'a note Edit writes', stdin: () => edit(join(vault, 'Projects', 'Spike.md')) },
      { name: 'a note Write writes', stdin: () => edit(join(vault, 'Projects', 'Spike.md'), 'Write') },
      { name: 'a note MultiEdit writes', stdin: () => edit(join(vault, 'Projects', 'Spike.md'), 'MultiEdit') },
    ])('PreToolUse saves a copy of $name', async ({ stdin }) => {
      // given
      const input = stdin();
      // when
      const result = await runHook('PreToolUse', env, input);
      // then
      expect(result).toEqual({ code: 0, stdout: '' });
      expect(await readFile(join(snapshots, 'Projects', 'Spike.md'), 'utf8')).toBe('# Before\n');
    });

    test('PreToolUse creates the snapshot folder on the first write', async () => {
      // given
      const missing = join(dir, 'config', 'snapshots', 's1');
      // when
      const result = await runHook(
        'PreToolUse',
        { ...env, MAPLE_SNAPSHOT_DIR: missing },
        anchorhold('Projects/Spike.md'),
      );
      // then
      expect(result).toEqual({ code: 0, stdout: '' });
      expect(await readFile(join(missing, 'Projects', 'Spike.md'), 'utf8')).toBe('# Before\n');
    });

    test('PreToolUse saves empty text for a note that does not exist yet', async () => {
      // given
      const input = anchorhold('Projects/New.md');
      // when
      const result = await runHook('PreToolUse', env, input);
      // then
      expect(result).toEqual({ code: 0, stdout: '' });
      expect(await readFile(join(snapshots, 'Projects', 'New.md'), 'utf8')).toBe('');
    });

    test('PreToolUse keeps the first copy of a note', async () => {
      // given
      const input = anchorhold('Projects/Spike.md');
      await runHook('PreToolUse', env, input);
      await writeFile(join(vault, 'Projects', 'Spike.md'), '# After\n');
      // when
      const result = await runHook('PreToolUse', env, input);
      // then
      expect(result).toEqual({ code: 0, stdout: '' });
      expect(await readFile(join(snapshots, 'Projects', 'Spike.md'), 'utf8')).toBe('# Before\n');
    });

    test.each([
      { name: 'a file outside the vault', stdin: () => edit(join(dir, 'other', 'a.md')) },
      { name: 'a sibling folder with a shared prefix', stdin: () => edit(`${vault}-old/a.md`) },
      { name: 'a non-Markdown file', stdin: () => edit(join(vault, 'a.png')) },
      { name: 'an anchorhold path that escapes', stdin: () => anchorhold('../x.md') },
      { name: 'an absolute anchorhold path outside the vault', stdin: () => anchorhold(join(dir, 'x.md')) },
      { name: 'a link to a file outside the vault', stdin: () => anchorhold('link.md') },
      { name: 'a folder named like a note', stdin: () => anchorhold('Folder.md') },
      { name: 'input with no tool_input', stdin: () => '{}' },
      { name: 'input that is not JSON', stdin: () => 'not json' },
      { name: 'a session without a vault', stdin: () => anchorhold('Projects/Spike.md'), blank: 'MAPLE_VAULT_DIR' },
      {
        name: 'a session without a snapshot dir',
        stdin: () => anchorhold('Projects/Spike.md'),
        blank: 'MAPLE_SNAPSHOT_DIR',
      },
    ])('PreToolUse saves nothing for $name', async ({ stdin, blank }) => {
      // given
      await writeFile(join(dir, 'secret.md'), 'secret\n');
      await symlink(join(dir, 'secret.md'), join(vault, 'link.md'));
      await mkdir(join(vault, 'Folder.md'));
      const runEnv = blank === undefined ? env : { ...env, [blank]: '' };
      // when
      const result = await runHook('PreToolUse', runEnv, stdin());
      // then
      expect(result).toEqual({ code: 0, stdout: '' });
      expect(await readdir(snapshots)).toEqual([]);
    });

    test('PreToolUse sends nothing to the socket', async () => {
      // given
      const socketPath = join(dir, 'maple.sock');
      const received: string[] = [];
      server = await listen(socketPath, received);
      // when
      const result = await runHook(
        'PreToolUse',
        { ...env, MAPLE_SOCKET: socketPath, MAPLE_TAB_ID: 'tab-1' },
        anchorhold('Projects/Spike.md'),
      );
      // then
      expect(result).toEqual({ code: 0, stdout: '' });
      expect(received).toEqual([]);
    });
  });
});
