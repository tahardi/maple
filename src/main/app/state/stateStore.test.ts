import { describe, expect, test } from 'vitest';
import type { SavedState } from './state';
import { createStateStore } from './stateStore';

const initial: SavedState = {
  version: 2,
  tabs: [],
  closedSessions: {},
  notifications: null,
  zoom: 0,
  lastProject: null,
  seen: {},
  queue: [],
};

function fakeSave() {
  const calls: { state: SavedState; resolve: () => void; reject: (err: Error) => void }[] = [];
  const save = (state: SavedState) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ state, resolve, reject });
    });
  return { calls, save };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createStateStore', () => {
  test('applies each patch over the current state', () => {
    // given
    const store = createStateStore(initial, fakeSave().save);
    // when
    void store.patch({ zoom: 1 });
    void store.patch({ lastProject: 'MPL' });
    // then
    expect(store.current()).toEqual({ ...initial, zoom: 1, lastProject: 'MPL' });
  });

  test('saves patches one at a time in order', async () => {
    // given
    const { calls, save } = fakeSave();
    const store = createStateStore(initial, save);
    void store.patch({ zoom: 1 });
    void store.patch({ lastProject: 'MPL' });
    await settle();
    expect(calls).toHaveLength(1);
    // when
    calls[0]?.resolve();
    await settle();
    // then
    expect(calls.map((c) => c.state)).toEqual([
      { ...initial, zoom: 1 },
      { ...initial, zoom: 1, lastProject: 'MPL' },
    ]);
  });

  test('keeps saving after a failed save', async () => {
    // given
    const { calls, save } = fakeSave();
    const store = createStateStore(initial, save);
    store.patch({ zoom: 1 }).catch(() => undefined);
    void store.patch({ zoom: 2 });
    await settle();
    // when
    calls[0]?.reject(new Error('writing state: disk full'));
    await settle();
    // then
    expect(calls.map((c) => c.state.zoom)).toEqual([1, 2]);
  });

  test('a read-only store applies patches but never saves', async () => {
    // given
    const { calls, save } = fakeSave();
    const store = createStateStore(initial, save, true);
    // when
    await store.patch({ zoom: 1 });
    // then
    expect(store.current().zoom).toBe(1);
    expect(calls).toHaveLength(0);
  });

  test('rejects the patch whose save failed', async () => {
    // given
    const { calls, save } = fakeSave();
    const store = createStateStore(initial, save);
    const first = store.patch({ zoom: 1 });
    await settle();
    // when
    calls[0]?.reject(new Error('writing state: disk full'));
    // then
    await expect(first).rejects.toThrow('writing state: disk full');
  });
});
