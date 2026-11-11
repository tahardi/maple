import { describe, expect, test } from 'vitest';
import { zoomKey } from './zoomKey';

describe('zoomKey', () => {
  test.each([
    { key: '=', control: true, meta: false, type: 'keyDown', want: 'in' },
    { key: '+', control: true, meta: false, type: 'keyDown', want: 'in' },
    { key: '-', control: true, meta: false, type: 'keyDown', want: 'out' },
    { key: '_', control: true, meta: false, type: 'keyDown', want: 'out' },
    { key: '0', control: true, meta: false, type: 'keyDown', want: 'reset' },
    { key: '=', control: false, meta: true, type: 'keyDown', want: 'in' },
    { key: '=', control: false, meta: false, type: 'keyDown', want: null },
    { key: '=', control: true, meta: false, type: 'keyUp', want: null },
    { key: 'a', control: true, meta: false, type: 'keyDown', want: null },
  ] as const)('maps $type $key (ctrl $control, meta $meta) to $want', ({ key, control, meta, type, want }) => {
    // given
    const input = { key, control, meta, alt: false, type };
    // when
    const change = zoomKey(input);
    // then
    expect(change).toBe(want);
  });

  test('ignores Alt so Ctrl+Alt combinations stay free', () => {
    // given
    const input = { key: '0', control: true, meta: false, alt: true, type: 'keyDown' };
    // when
    const change = zoomKey(input);
    // then
    expect(change).toBeNull();
  });
});
