import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HookEvent } from '@shared/types';
import { hookSocketPath, startHookServer } from './hookServer';

function sendLines(socketPath: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = connect(socketPath, () => {
      client.end(text, resolve);
    });
    client.on('error', reject);
  });
}

function sendChunks(socketPath: string, chunks: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = connect(socketPath, () => {
      void (async () => {
        for (const chunk of chunks) {
          client.write(chunk);
          await new Promise((r) => setTimeout(r, 20));
        }
        client.end(resolve);
      })();
    });
    client.on('error', reject);
  });
}

const stop: HookEvent = { tabId: 't1', event: 'Stop', notificationType: null };
const notify: HookEvent = { tabId: 't2', event: 'Notification', notificationType: 'permission_prompt' };

describe('startHookServer', () => {
  let dir = '';
  let close: () => Promise<void> = () => Promise.resolve();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-sock-'));
  });

  afterEach(async () => {
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  test.each([
    { name: 'two lines in one chunk', text: `${JSON.stringify(stop)}\n${JSON.stringify(notify)}\n` },
    {
      name: 'a malformed line between them',
      text: `${JSON.stringify(stop)}\nnot json\n{"tabId":1}\n${JSON.stringify(notify)}\n`,
    },
  ])('delivers each valid event from $name', async ({ text }) => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const onEvent = vi.fn<(e: HookEvent) => void>();
    close = await startHookServer(socketPath, onEvent);
    // when
    await sendLines(socketPath, text);
    // then
    await vi.waitFor(() => {
      expect(onEvent.mock.calls).toEqual([[stop], [notify]]);
    });
  });

  test('logs a malformed line at warn', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    close = await startHookServer(socketPath, () => undefined, logger);
    // when
    await sendLines(socketPath, 'not json\n');
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('hook', 'malformed', { line: 'not json' });
    });
  });

  test('replaces a stale socket file', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    await writeFile(socketPath, '');
    const onEvent = vi.fn<(e: HookEvent) => void>();
    // when
    close = await startHookServer(socketPath, onEvent);
    await sendLines(socketPath, `${JSON.stringify(stop)}\n`);
    // then
    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(stop);
    });
  });

  test('joins a line split across writes', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const onEvent = vi.fn<(e: HookEvent) => void>();
    close = await startHookServer(socketPath, onEvent);
    const line = `${JSON.stringify(notify)}\n`;
    // when
    await sendChunks(socketPath, [line.slice(0, 10), line.slice(10)]);
    // then
    await vi.waitFor(() => {
      expect(onEvent.mock.calls).toEqual([[notify]]);
    });
  });

  test('close frees the socket so the server can start again', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const onEvent = vi.fn<(e: HookEvent) => void>();
    await (
      await startHookServer(socketPath, vi.fn())
    )();
    // when
    close = await startHookServer(socketPath, onEvent);
    await sendLines(socketPath, `${JSON.stringify(stop)}\n`);
    // then
    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(stop);
    });
  });

  test('logs each event received', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    close = await startHookServer(socketPath, () => undefined, logger);
    // when
    await sendLines(socketPath, `${JSON.stringify(notify)}\n`);
    // then
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('hook', 'received', notify);
    });
  });

  test('logs the first 200 characters of a malformed line', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    close = await startHookServer(socketPath, () => undefined, logger);
    // when
    await sendLines(socketPath, `${'x'.repeat(300)}\n`);
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('hook', 'malformed', { line: 'x'.repeat(200) });
    });
  });

  test('skips blank lines without logging', async () => {
    // given
    const socketPath = join(dir, 'maple.sock');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const onEvent = vi.fn<(e: HookEvent) => void>();
    close = await startHookServer(socketPath, onEvent, logger);
    // when
    await sendLines(socketPath, `\n${JSON.stringify(stop)}\n`);
    // then
    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(stop);
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('hookSocketPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { name: 'XDG_RUNTIME_DIR when set', runtime: '/run/user/1000', want: '/run/user/1000/maple.sock' },
    { name: 'the config dir otherwise', runtime: undefined, want: '/tmp/maple-config/maple.sock' },
  ])('uses $name', ({ runtime, want }) => {
    // given
    vi.stubEnv('XDG_RUNTIME_DIR', runtime);
    vi.stubEnv('MAPLE_CONFIG_DIR', '/tmp/maple-config');
    // when
    const path = hookSocketPath();
    // then
    expect(path).toBe(want);
  });
});
