import { describe, expect, test, vi } from 'vitest';
import { createZoom } from './windowZoom';

function fakeWindow(level: number) {
  const contents = {
    level,
    getZoomLevel: () => contents.level,
    setZoomLevel: (next: number) => {
      contents.level = next;
    },
  };
  return contents;
}

describe('createZoom', () => {
  test.each([
    { change: 'in', want: 1.5 },
    { change: 'out', want: 0.5 },
    { change: 'reset', want: 0 },
  ] as const)('zooms $change from 1 to $want and saves it', async ({ change, want }) => {
    // given
    const contents = fakeWindow(1);
    const save = vi.fn(() => Promise.resolve());
    const zoom = createZoom(
      () => contents,
      () => 1,
      save,
    );
    // when
    await zoom.set(change);
    // then
    expect(contents.level).toBe(want);
    expect(save).toHaveBeenCalledExactlyOnceWith(want);
  });

  test('does nothing when there is no window', async () => {
    // given
    const save = vi.fn(() => Promise.resolve());
    const zoom = createZoom(
      () => null,
      () => 1,
      save,
    );
    // when
    await zoom.set('in');
    // then
    expect(save).not.toHaveBeenCalled();
  });

  test('reports the saved zoom level', () => {
    // given
    const zoom = createZoom(
      () => null,
      () => 2.5,
      () => Promise.resolve(),
    );
    // when
    const level = zoom.level();
    // then
    expect(level).toBe(2.5);
  });
});
