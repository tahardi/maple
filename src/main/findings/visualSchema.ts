import { z } from 'zod';
import type { FindingVisual } from '@shared/types/findings/findingVisual';

const zone = z.string().max(40);
const item = z.string().max(120);

const path = z
  .array(z.object({ actor: z.string().max(40), step: item }))
  .min(2)
  .max(6);

const map = z
  .object({ zones: z.array(zone).min(2).max(6), from: zone, to: zone })
  .refine(({ zones }) => new Set(zones).size === zones.length)
  .refine(({ zones, from, to }) => from !== to && zones.includes(from) && zones.includes(to));

const reach = z.object({ now: z.array(item).min(1).max(4), afterFix: z.array(item).max(4) });

export const visualSchema: z.ZodType<FindingVisual | undefined> = z
  .object({
    path: path.optional().catch(undefined),
    map: map.optional().catch(undefined),
    reach: reach.optional().catch(undefined),
  })
  .transform(({ path, map, reach }) => {
    const visual: FindingVisual = {
      ...(path && { path }),
      ...(map && { map }),
      ...(reach && { reach }),
    };
    return Object.keys(visual).length > 0 ? visual : undefined;
  })
  .catch(undefined);
