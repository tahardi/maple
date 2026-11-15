import { z } from 'zod';
import { listOf } from './listOf';
import { textField } from './textField';

const stepSchema = z.object({
  actor: textField(40),
  step: textField(120),
  zone: textField(40),
  crosses: textField(60).optional(),
});

function zonesInGroups(steps: readonly { zone: string }[]): boolean {
  const zones: string[] = [];
  for (const { zone } of steps) {
    if (zone !== zones.at(-1)) {
      zones.push(zone);
    }
  }
  return zones.length <= 3 && new Set(zones).size === zones.length;
}

export const pathSchema = z
  .object({ steps: listOf(stepSchema, 2, 6).refine(zonesInGroups, 'has zones out of order or more than 3') })
  .transform(({ steps }) => steps);
