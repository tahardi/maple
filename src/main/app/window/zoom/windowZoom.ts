import type { WebContents } from 'electron';
import { zoomLevel, type ZoomChange } from './zoom';

type ZoomTarget = Pick<WebContents, 'getZoomLevel' | 'setZoomLevel'>;

export type Zoom = { level: () => number; set: (change: ZoomChange) => Promise<void> };

export function createZoom(
  contents: () => ZoomTarget | null,
  saved: () => number,
  save: (zoom: number) => Promise<void>,
): Zoom {
  return {
    level: saved,
    set: async (change) => {
      const target = contents();
      if (!target) {
        return;
      }
      const zoom = zoomLevel(target.getZoomLevel(), change);
      target.setZoomLevel(zoom);
      await save(zoom);
    },
  };
}
