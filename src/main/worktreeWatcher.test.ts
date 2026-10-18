import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { watchWorktree } from './worktreeWatcher';

describe('watchWorktree', () => {
  let dir: string;
  let stop: () => void = () => undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'maple-watch-'));
    mkdirSync(join(dir, '.git'));
  });

  afterEach(() => {
    stop();
    rmSync(dir, { recursive: true, force: true });
  });

  test('calls onChange once for writes within the debounce window', async () => {
    // given
    const onChange = vi.fn();
    stop = watchWorktree(dir, onChange);
    await sleep(100);
    // when
    writeFileSync(join(dir, 'a.txt'), 'a');
    await sleep(50);
    writeFileSync(join(dir, 'b.txt'), 'b');
    await sleep(600);
    // then
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('ignores writes under .git', async () => {
    // given
    const onChange = vi.fn();
    stop = watchWorktree(dir, onChange);
    await sleep(100);
    // when
    writeFileSync(join(dir, '.git', 'index'), 'x');
    await sleep(600);
    // then
    expect(onChange).not.toHaveBeenCalled();
  });
});
