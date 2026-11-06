import { overviewScale, scrollTopAt } from './overviewScroll';

describe('overviewScale', () => {
  test.each([
    { name: 'fits the width of a short note', note: { width: 720, height: 300 }, want: 0.1 },
    { name: 'fits the height of a long note', note: { width: 720, height: 12000 }, want: 0.05 },
    { name: 'is 0 for a note with no size', note: { width: 0, height: 0 }, want: 0 },
    { name: 'is 0 for a note with no width', note: { width: 0, height: 300 }, want: 0 },
    { name: 'is 0 for a note with no height', note: { width: 720, height: 0 }, want: 0 },
  ])('$name', ({ note, want }) => {
    // given
    const strip = { width: 72, height: 600 };
    // when
    const scale = overviewScale(note, strip);
    // then
    expect(scale).toBe(want);
  });
});

describe('scrollTopAt', () => {
  test.each([
    { name: 'centres the view on the clicked spot', y: 100, scale: 0.05, maxScroll: 3800, want: 1900 },
    { name: 'stops at the top', y: 2, scale: 0.05, maxScroll: 3800, want: 0 },
    { name: 'stops at the bottom', y: 199, scale: 0.05, maxScroll: 3800, want: 3800 },
    { name: 'stays put on a note that fits', y: 100, scale: 0.05, maxScroll: 0, want: 0 },
    { name: 'stays at the top with no scale', y: 0, scale: 0, maxScroll: 3800, want: 0 },
  ])('$name', ({ y, scale, maxScroll, want }) => {
    // given
    const viewHeight = 200;
    // when
    const top = scrollTopAt(y, scale, viewHeight, maxScroll);
    // then
    expect(top).toBe(want);
  });
});
