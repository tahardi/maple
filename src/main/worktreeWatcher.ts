import { watch, type WatchOptions } from 'node:fs';
import { sep } from 'node:path';

const DEBOUNCE_MS = 300;
const IGNORED = ['.git', 'node_modules'];

function debounced(onChange: () => void): { trigger: () => void; cancel: () => void } {
  let timer: NodeJS.Timeout | null = null;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const trigger = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  };
  return { trigger, cancel };
}

function ignored(path: string): boolean {
  return path.endsWith('.asar') || path.split(sep).some((part) => IGNORED.includes(part));
}

export function watchWorktrees(dir: string, onChange: () => void): () => void {
  const { trigger, cancel } = debounced(onChange);
  const watcher = watch(dir, trigger);
  return () => {
    cancel();
    watcher.close();
  };
}

export function watchWorktree(path: string, onChange: () => void): () => void {
  const { trigger, cancel } = debounced(onChange);
  const options: WatchOptions & { ignore: (path: string) => boolean } = { recursive: true, ignore: ignored };
  const watcher = watch(path, options, trigger);
  return () => {
    cancel();
    watcher.close();
  };
}
