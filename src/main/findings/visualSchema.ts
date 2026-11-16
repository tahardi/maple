import { z } from 'zod';
import type { FindingVisual } from '@shared/types/findings/findingVisual';

const item = z.string().max(120);

const step = z.object({
  actor: z.string().max(40),
  step: item,
  zone: z.string().max(40).optional(),
  crosses: z.string().max(60).optional(),
});

function zonesInGroups(steps: readonly { zone?: string }[]): boolean {
  const zones: string[] = [];
  for (const { zone } of steps) {
    if (zone && zone !== zones.at(-1)) {
      zones.push(zone);
    }
  }
  return zones.length <= 3 && new Set(zones).size === zones.length;
}

const path = z.array(step).min(2).max(6).refine(zonesInGroups);

const reach = z.object({ now: z.array(item).min(1).max(4), afterFix: z.array(item).max(4) });

export const visualSchema: z.ZodType<FindingVisual | undefined> = z
  .object({
    path: path.optional().catch(undefined),
    reach: reach.optional().catch(undefined),
  })
  .transform(({ path, reach }) => {
    const visual: FindingVisual = {
      ...(path && { path }),
      ...(reach && { reach }),
    };
    return Object.keys(visual).length > 0 ? visual : undefined;
  })
  .catch(undefined);
