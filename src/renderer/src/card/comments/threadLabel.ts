import type { Thread } from './commentThreads';

export function threadLabel(thread: Thread): string {
  return thread.startLine === null
    ? `Line ${String(thread.line)}`
    : `Lines ${String(thread.startLine)}-${String(thread.line)}`;
}
