import { splitSize, type SplitOptions } from './splitSize';

const BOX = { left: 100, top: 50, width: 1000, height: 500 };

describe('splitSize', () => {
  test.each<
    { name: string; edge: SplitOptions['edge']; axis: SplitOptions['axis']; unit: SplitOptions['unit'] } & {
      point: { x: number; y: number };
      min: number;
      max: number;
      expected: number;
    }
  >([
    {
      name: 'tree width',
      edge: 'start',
      axis: 'x',
      unit: 'px',
      point: { x: 340, y: 0 },
      min: 120,
      max: 480,
      expected: 240,
    },
    {
      name: 'Claude width',
      edge: 'end',
      axis: 'x',
      unit: '%',
      point: { x: 780, y: 0 },
      min: 10,
      max: 80,
      expected: 32,
    },
    {
      name: 'top height',
      edge: 'start',
      axis: 'y',
      unit: '%',
      point: { x: 0, y: 200 },
      min: 10,
      max: 80,
      expected: 30,
    },
    {
      name: 'terminal height',
      edge: 'end',
      axis: 'y',
      unit: '%',
      point: { x: 0, y: 350 },
      min: 10,
      max: 80,
      expected: 40,
    },
    {
      name: 'past max',
      edge: 'start',
      axis: 'x',
      unit: 'px',
      point: { x: 900, y: 0 },
      min: 120,
      max: 480,
      expected: 480,
    },
    {
      name: 'before min',
      edge: 'start',
      axis: 'x',
      unit: 'px',
      point: { x: 110, y: 0 },
      min: 120,
      max: 480,
      expected: 120,
    },
  ])('sizes a $edge pane on $axis in $unit: $name', ({ edge, axis, unit, point, min, max, expected }) => {
    // given
    const options: SplitOptions = { axis, edge, unit, min, max };
    // when
    const size = splitSize(BOX, point, options);
    // then
    expect(size).toBe(expected);
  });
});
