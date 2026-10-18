import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { watchWorktree, watchWorktrees } from './worktreeWatcher';

describe('watchWorktree', () => {
  let dir: string;
  let stop: () => void = () => undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'maple-watch-'));
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
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

  test('calls onChange again for writes after the debounce window', async () => {
    // given
    const onChange = vi.fn();
    stop = watchWorktree(dir, onChange);
    await sleep(100);
    // when
    writeFileSync(join(dir, 'a.txt'), 'a');
    await sleep(600);
    writeFileSync(join(dir, 'b.txt'), 'b');
    await sleep(600);
    // then
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test('calls onChange for writes in nested dirs', async () => {
    // given
    const onChange = vi.fn();
    stop = watchWorktree(dir, onChange);
    await sleep(100);
    // when
    writeFileSync(join(dir, 'src', 'deep', 'file.ts'), 'x');
    await sleep(600);
    // then
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test.each([
    { name: '.git', parts: ['.git', 'index'] },
    { name: 'node_modules', parts: ['node_modules', 'pkg', 'index.js'] },
  ])('ignores writes under $name', async ({ parts }) => {
    // given
    const onChange = vi.fn();
    stop = watchWorktree(dir, onChange);
    await sleep(100);
    // when
    writeFileSync(join(dir, ...parts), 'x');
    await sleep(600);
    // then
    expect(onChange).not.toHaveBeenCalled();
  });

  test('stops calling onChange once stopped, even with a call pending', async () => {
    // given
    const onChange = vi.fn();
    stop = watchWorktree(dir, onChange);
    await sleep(100);
    writeFileSync(join(dir, 'a.txt'), 'a');
    await sleep(50);
    // when
    stop();
    writeFileSync(join(dir, 'b.txt'), 'b');
    await sleep(600);
    // then
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('watchWorktrees', () => {
  let dir: string;
  let stop: () => void = () => undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'maple-watch-'));
  });

  afterEach(() => {
    stop();
    rmSync(dir, { recursive: true, force: true });
  });

  test('calls onChange once when worktree dirs are added', async () => {
    // given
    const onChange = vi.fn();
    stop = watchWorktrees(dir, onChange);
    await sleep(100);
    // when
    mkdirSync(join(dir, 'maple-mpl-1-a'));
    mkdirSync(join(dir, 'maple-mpl-2-b'));
    await sleep(600);
    // then
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
