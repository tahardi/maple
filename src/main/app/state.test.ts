import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadState, saveState, type SavedState } from './state';

const emptyState: SavedState = {
  version: 1,
  tabs: [],
  closedSessions: {},
  notifications: null,
  zoom: 0,
  lastProject: null,
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
    },
  ],
  closedSessions: { 'DIG-40': 'session-0' },
  notifications: false,
  zoom: 1.5,
  lastProject: 'MPL',
};

describe('state', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-state-'));
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
    expect(result).toEqual({ state: savedState, warning: null });
  });

  test('round-trips a vault tab', async () => {
    // given
    const vaultTab = { ...savedState.tabs[0], kind: 'vault' as const, cardKey: null, worktreePath: null };
    const state = { ...savedState, tabs: [vaultTab] };
    await saveState(state, dir);
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state, warning: null });
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

  test('leaves no temp file after saving', async () => {
    // given
    const nested = join(dir, 'nested');
    // when
    await saveState(savedState, nested);
    // then
    expect(await readdir(nested)).toEqual(['state.json']);
  });

  test.each([
    { name: 'missing', content: null, warning: null },
    { name: 'corrupt', content: '{', warning: 'reading state: state.json is unreadable, starting with no tabs' },
    {
      name: 'holding a non-string lastProject',
      content: JSON.stringify({ ...savedState, lastProject: 42 }),
      warning: 'reading state: state.json is unreadable, starting with no tabs',
    },
  ])('starts empty when the file is $name', async ({ content, warning }) => {
    // given
    if (content !== null) {
      await writeFile(join(dir, 'state.json'), content);
    }
    // when
    const result = await loadState(dir);
    // then
    expect(result).toEqual({ state: emptyState, warning });
  });
});
