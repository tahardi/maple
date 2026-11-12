import { describe, expect, test, vi } from 'vitest';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import { createConfigGate } from './configGate';

const config: MapleConfig = {
  worktreesDir: '/wts',
  vaultDir: null,
  notifications: true,
  backgroundWaitMinutes: 10,
  eventKeepDays: 30,
  eventMaxMegabytes: 100,
  stateBackups: 5,
  startAtOnce: 1,
  startGapSeconds: 30,
  maxWorking: 4,
  maxLoadPerCore: 1,
  minFreeMegabytes: 512,
  projects: [],
  actions: [],
};

describe('createConfigGate', () => {
  test('runs the first-config step at start when config is already loaded', async () => {
    // given
    const onFirstConfig = vi.fn(() => Promise.resolve());
    const gate = createConfigGate(config, onFirstConfig);
    // when
    await gate.start();
    // then
    expect(onFirstConfig).toHaveBeenCalledExactlyOnceWith(config);
  });

  test('waits for the first loaded config when it was missing at start', async () => {
    // given
    const onFirstConfig = vi.fn(() => Promise.resolve());
    const gate = createConfigGate(null, onFirstConfig);
    await gate.start();
    expect(onFirstConfig).not.toHaveBeenCalled();
    // when
    await gate.loaded(config);
    // then
    expect(onFirstConfig).toHaveBeenCalledExactlyOnceWith(config);
  });

  test.each([
    { name: 'no config yet', initial: null },
    { name: 'a loaded config', initial: config },
  ])('ignores a reload with no config when it has $name', async ({ initial }) => {
    // given
    const onFirstConfig = vi.fn(() => Promise.resolve());
    const gate = createConfigGate(initial, onFirstConfig);
    await gate.start();
    onFirstConfig.mockClear();
    // when
    await gate.loaded(null);
    // then
    expect(gate.current()).toBe(initial);
    expect(onFirstConfig).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'one after another', together: false },
    { name: 'started together', together: true },
  ])('runs the first-config step only once for two reloads $name', async ({ together }) => {
    // given
    const onFirstConfig = vi.fn(() => Promise.resolve());
    const gate = createConfigGate(null, onFirstConfig);
    await gate.start();
    const next = { ...config, worktreesDir: '/other' };
    // when
    if (together) {
      await Promise.all([gate.loaded(config), gate.loaded(next)]);
    } else {
      await gate.loaded(config);
      await gate.loaded(next);
    }
    // then
    expect(onFirstConfig).toHaveBeenCalledExactlyOnceWith(config);
  });

  test('returns the latest config', async () => {
    // given
    const gate = createConfigGate(config, () => Promise.resolve());
    await gate.start();
    const next = { ...config, worktreesDir: '/other' };
    // when
    await gate.loaded(next);
    // then
    expect(gate.current()).toBe(next);
  });
});
