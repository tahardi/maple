export type Size = { width: number; height: number };

export function overviewScale(note: Size, strip: Size): number {
  if (note.width === 0 || note.height === 0) {
    return 0;
  }
  return Math.min(strip.width / note.width, strip.height / note.height);
}

export function scrollTopAt(y: number, scale: number, viewHeight: number, maxScroll: number): number {
  if (scale === 0) {
    return 0;
  }
  return Math.min(Math.max(y / scale - viewHeight / 2, 0), maxScroll);
}
