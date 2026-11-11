import type { ZoomChange } from './zoom';

type KeyInput = {
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  type: string;
};

const KEYS: Record<string, ZoomChange> = { '=': 'in', '+': 'in', '-': 'out', _: 'out', '0': 'reset' };

export function zoomKey(input: KeyInput): ZoomChange | null {
  if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) {
    return null;
  }
  return KEYS[input.key] ?? null;
}
