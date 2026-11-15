import { vi } from 'vitest';
import type { Runner } from '@main/remote/runner';

export function fakeRunner(): Runner {
  return { exec: vi.fn(), spawnPty: vi.fn(), readFile: vi.fn(), follow: vi.fn() };
}
