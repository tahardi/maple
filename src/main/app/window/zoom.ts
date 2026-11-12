export type ZoomChange = 'in' | 'out' | 'reset';

const STEP = 0.5;

export function zoomLevel(current: number, change: ZoomChange): number {
  if (change === 'reset') {
    return 0;
  }
  return change === 'in' ? current + STEP : current - STEP;
}
