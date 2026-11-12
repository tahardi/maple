import { describe, expect, test } from 'vitest';
import { zoomKey } from './zoomKey';

describe('zoomKey', () => {
  test.each([
    { key: '=', control: true, meta: false, alt: false, type: 'keyDown', want: 'in' },
    { key: '+', control: true, meta: false, alt: false, type: 'keyDown', want: 'in' },
    { key: '-', control: true, meta: false, alt: false, type: 'keyDown', want: 'out' },
    { key: '0', control: true, meta: false, alt: false, type: 'keyDown', want: 'reset' },
    { key: '=', control: false, meta: true, alt: false, type: 'keyDown', want: 'in' },
    { key: '_', control: true, meta: false, alt: false, type: 'keyDown', want: null },
    { key: '0', control: true, meta: false, alt: true, type: 'keyDown', want: null },
    { key: '=', control: false, meta: false, alt: false, type: 'keyDown', want: null },
    { key: '=', control: true, meta: false, alt: false, type: 'keyUp', want: null },
    { key: 'a', control: true, meta: false, alt: false, type: 'keyDown', want: null },
  ] as const)(
    'maps $type $key (ctrl $control, meta $meta, alt $alt) to $want',
    ({ key, control, meta, alt, type, want }) => {
      // given
      const input = { key, control, meta, alt, type };
      // when
      const change = zoomKey(input);
      // then
      expect(change).toBe(want);
    },
  );
});
