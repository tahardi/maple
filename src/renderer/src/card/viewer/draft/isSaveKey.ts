import type { KeyboardEvent } from 'react';

export function isSaveKey(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.key.toLowerCase() !== 's') {
    return false;
  }
  e.preventDefault();
  return true;
}
