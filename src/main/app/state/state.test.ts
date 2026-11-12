import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadState, saveState, type SavedState } from './state';

const calls = vi.hoisted((): string[] => []);
const flush = vi.hoisted(() => ({ error: null as Error | null, closed: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        calls.push('sync');
        if (flush.error) {
          throw flush.error;
        }
        await sync();
      };
      const close = handle.close.bind(handle);
      handle.close = async () => {
        flush.closed += 1;
        await close();
      };
      return handle;
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      calls.push('rename');
      await actual.rename(...args);
    },
  };
});

const emptyState: SavedState = {
  version: 1,
  tabs: [],
  closedSessions: {},
  notifications: null,
  zoom: 0,
  lastProject: null,
  seen: {},
  queue: [],
};

const savedState: SavedState = {
  version: 1,
  tabs: [
    {
      id: 'tab-1',
      projectKey: 'DIG',
      kind: 'card',
      cardKey: 'DIG-44',
      sessionId: 'session-1',
      worktreePath: '/tmp/wts/dig-44',
      worktreePaths: ['/wts/a', '/wts/b'],
    },
  ],
  closedSessions: { 'DIG-40': 'session-0' },
  notifications: false,
  zoom: 1.5,
  lastProject: 'MPL',
  seen: { 'tab-1': 'waiting' },
  queue: [{ projectKey: 'DIG', cardKey: 'DIG-45' }],
};

function keptWarning(dir: string): string {
  const kept = join(dir, 'state.json.corrupt');
  return `reading state: state.json is unreadable, kept it as ${kept}, starting with no tabs`;
}

describe('state', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-state-'));
    calls.length = 0;
    flush.error = null;
    flush.closed = 0;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('round-trips a saved state', async () => {
    // given
    await saveState(savedState, dir);
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state: savedState, warning: null, readOnly: false });
  });

  test('round-trips a vault tab', async () => {
    // given
    const vaultTab = { ...savedState.tabs[0], kind: 'vault' as const, cardKey: null, worktreePath: null };
    const state = { ...savedState, tabs: [vaultTab] };
    await saveState(state, dir);
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state, warning: null, readOnly: false });
  });

  test('defaults worktreePaths to an empty list when missing', async () => {
    // given
    const withoutPaths = { ...savedState, tabs: [{ ...savedState.tabs[0], worktreePaths: undefined }] };
    await writeFile(join(dir, 'state.json'), JSON.stringify(withoutPaths));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state.tabs[0]?.worktreePaths).toEqual([]);
  });

  test('defaults closedSessions when missing', async () => {
    // given
    const withoutClosed = { ...savedState, closedSessions: undefined };
    await writeFile(join(dir, 'state.json'), JSON.stringify(withoutClosed));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state.closedSessions).toEqual({});
  });

  test('defaults queue to empty when missing', async () => {
    // given
    await writeFile(join(dir, 'state.json'), JSON.stringify({ ...savedState, queue: undefined }));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state.queue).toEqual([]);
  });

  test('defaults zoom to 0 when missing', async () => {
    // given
    const withoutZoom = { ...savedState, zoom: undefined };
    await writeFile(join(dir, 'state.json'), JSON.stringify(withoutZoom));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state.zoom).toBe(0);
  });

  test('defaults lastProject to null when missing', async () => {
    // given
    const withoutLastProject = { ...savedState, lastProject: undefined };
    await writeFile(join(dir, 'state.json'), JSON.stringify(withoutLastProject));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state).toEqual({ ...savedState, lastProject: null });
  });

  test('defaults seen to empty when missing', async () => {
    // given
    const withoutSeen = { ...savedState, seen: undefined };
    await writeFile(join(dir, 'state.json'), JSON.stringify(withoutSeen));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state.seen).toEqual({});
  });

  test.each([
    { name: 'an unknown dot', seen: { 'tab-1': 'blue' } },
    { name: 'something that is not a map', seen: 42 },
  ])('keeps the tabs and empties seen when it holds $name', async ({ seen }) => {
    // given
    await writeFile(join(dir, 'state.json'), JSON.stringify({ ...savedState, seen }));
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state: { ...savedState, seen: {} }, warning: null, readOnly: false });
  });

  test('drops seen entries for tabs that are not saved', async () => {
    // given
    const withGone = { ...savedState, seen: { 'tab-1': 'ready', gone: 'waiting' } };
    await writeFile(join(dir, 'state.json'), JSON.stringify(withGone));
    // when
    const result = await loadState(dir);
    // then
    expect(result.state.seen).toEqual({ 'tab-1': 'ready' });
  });

  test('leaves no temp file after saving', async () => {
    // given
    const nested = join(dir, 'nested');
    // when
    await saveState(savedState, nested);
    // then
    expect(await readdir(nested)).toEqual(['state.json']);
  });

  test('flushes the temp file before renaming it', async () => {
    // given
    await writeFile(join(dir, 'state.json'), '"old"');
    // when
    await saveState(savedState, dir);
    // then
    expect(calls).toEqual(['sync', 'rename']);
  });

  test('keeps the old file and closes the temp file when the flush fails', async () => {
    // given
    await writeFile(join(dir, 'state.json'), '"old"');
    flush.error = new Error('disk full');
    // when
    const saving = saveState(savedState, dir);
    // then
    await expect(saving).rejects.toThrow('disk full');
    expect(calls).not.toContain('rename');
    expect(flush.closed).toBe(1);
    expect(await readFile(join(dir, 'state.json'), 'utf8')).toBe('"old"');
  });

  test('backs up a changed state.json on each load', async () => {
    // given
    const zooms = [1, 2, 3];
    // when
    for (const zoom of zooms) {
      await saveState({ ...savedState, zoom }, dir);
      await loadState(dir);
    }
    // then
    for (const [n, zoom] of [
      ['1', 3],
      ['2', 2],
      ['3', 1],
    ] as const) {
      expect(JSON.parse(await readFile(join(dir, `state.json.${n}`), 'utf8'))).toEqual({ ...savedState, zoom });
    }
  });

  test('keeps the given number of backups on load', async () => {
    // given
    await saveState(savedState, dir);
    await loadState(dir, 1);
    // when
    await saveState({ ...savedState, zoom: 3 }, dir);
    await loadState(dir, 1);
    // then
    expect(await readdir(dir)).not.toContain('state.json.2');
  });

  test('names the newest backup when state.json is unreadable', async () => {
    // given
    await saveState(savedState, dir);
    await loadState(dir);
    await writeFile(join(dir, 'state.json'), '{');
    // when
    const result = await loadState(dir);
    // then
    expect(result.warning).toBe(`${keptWarning(dir)} (newest backup: ${join(dir, 'state.json.1')})`);
  });

  test.each([{ name: 'missing' }])('starts empty with no warning when the file is $name', async () => {
    // given
    await rm(join(dir, 'state.json'), { force: true });
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state: emptyState, warning: null, readOnly: false });
    expect(await readdir(dir)).not.toContain('state.json.1');
  });

  test.each([
    { name: 'corrupt', content: '{' },
    { name: 'holding a non-string lastProject', content: JSON.stringify({ ...savedState, lastProject: 42 }) },
  ])('keeps a $name file as state.json.corrupt', async ({ content }) => {
    // given
    await writeFile(join(dir, 'state.json'), content);
    // when
    const result = await loadState(dir);
    await saveState(savedState, dir);
    // then
    expect(result).toEqual({ state: emptyState, warning: keptWarning(dir), readOnly: false });
    expect(await readFile(join(dir, 'state.json.corrupt'), 'utf8')).toBe(content);
    expect(await readdir(dir)).not.toContain('state.json.1');
  });

  test('keeps the backup when a later save replaces state.json', async () => {
    // given
    await saveState(savedState, dir);
    await loadState(dir);
    // when
    await saveState({ ...savedState, zoom: 3 }, dir);
    // then
    expect(JSON.parse(await readFile(join(dir, 'state.json.1'), 'utf8'))).toEqual(savedState);
  });

  test('still loads the state when the backup fails', async () => {
    // given
    await saveState(savedState, dir);
    await writeFile(join(dir, 'state.json.2'), '"two"');
    await mkdir(join(dir, 'state.json.3', 'blocker'), { recursive: true });
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({
      state: savedState,
      warning: expect.stringMatching(/^backing up state: /) as string,
      readOnly: false,
    });
  });

  test('starts empty without touching a state.json from a newer Maple', async () => {
    // given
    const content = JSON.stringify({ ...savedState, version: 2 });
    await writeFile(join(dir, 'state.json'), content);
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({
      state: emptyState,
      warning:
        `reading state: ${join(dir, 'state.json')} is from a newer Maple (version 2, this build reads up to 1), ` +
        'starting with no tabs and not saving until Maple is updated',
      readOnly: true,
    });
    expect(await readFile(join(dir, 'state.json'), 'utf8')).toBe(content);
    expect(await readdir(dir)).not.toContain('state.json.corrupt');
    expect(await readdir(dir)).not.toContain('state.json.1');
  });

  test('loads a state.json with no version', async () => {
    // given
    await writeFile(join(dir, 'state.json'), JSON.stringify({ ...savedState, version: undefined }));
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state: savedState, warning: null, readOnly: false });
  });

  test('replaces an older corrupt copy', async () => {
    // given
    await writeFile(join(dir, 'state.json.corrupt'), 'older');
    await writeFile(join(dir, 'state.json'), '{');
    // when
    await loadState(dir);
    // then
    expect(await readFile(join(dir, 'state.json.corrupt'), 'utf8')).toBe('{');
  });

  test('warns when a corrupt file cannot be kept', async () => {
    // given
    await writeFile(join(dir, 'state.json'), '{');
    await mkdir(join(dir, 'state.json.corrupt', 'blocker'), { recursive: true });
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({
      state: emptyState,
      warning: expect.stringMatching(/^reading state: state\.json is unreadable and could not be kept: /) as string,
      readOnly: false,
    });
  });

  test('warns when state.json cannot be read', async () => {
    // given
    await mkdir(join(dir, 'state.json'));
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state: emptyState, warning: keptWarning(dir), readOnly: false });
    expect((await stat(join(dir, 'state.json.corrupt'))).isDirectory()).toBe(true);
  });
});
