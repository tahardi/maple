export type SplitOptions = { axis: 'x' | 'y'; edge: 'start' | 'end'; unit: 'px' | '%'; min: number; max: number };

type Box = { left: number; top: number; width: number; height: number };

export function splitSize(box: Box, point: { x: number; y: number }, options: SplitOptions): number {
  const { axis, edge, unit, min, max } = options;
  const origin = axis === 'x' ? box.left : box.top;
  const length = axis === 'x' ? box.width : box.height;
  const offset = (axis === 'x' ? point.x : point.y) - origin;
  const px = edge === 'start' ? offset : length - offset;
  const size = unit === '%' ? (px / length) * 100 : px;
  return Math.min(max, Math.max(min, size));
}
