import type { KeyboardEvent } from 'react';
import { isSaveKey } from './isSaveKey';

function press(key: string, ctrlKey: boolean) {
  return { key, ctrlKey, preventDefault: vi.fn() };
}

describe('isSaveKey', () => {
  test.each([
    { name: 'Ctrl+s', key: 's', ctrlKey: true, want: true },
    { name: 'Ctrl+S', key: 'S', ctrlKey: true, want: true },
    { name: 'plain s', key: 's', ctrlKey: false, want: false },
    { name: 'Ctrl+a', key: 'a', ctrlKey: true, want: false },
  ])('$name is a save: $want', ({ key, ctrlKey, want }) => {
    // given
    const e = press(key, ctrlKey);
    // when
    const got = isSaveKey(e as unknown as KeyboardEvent);
    // then
    expect(got).toBe(want);
  });

  test('prevents the default on a save', () => {
    // given
    const e = press('s', true);
    // when
    isSaveKey(e as unknown as KeyboardEvent);
    // then
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });
});
