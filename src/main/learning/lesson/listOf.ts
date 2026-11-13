import { z } from 'zod';

export function listOf<T extends z.ZodType>(item: T, least: number, most: number) {
  return z.array(item).superRefine((items, ctx) => {
    if (items.length < least || items.length > most) {
      ctx.addIssue({
        code: 'custom',
        message: `has ${String(items.length)} items, want ${String(least)} to ${String(most)}`,
      });
    }
  });
}
