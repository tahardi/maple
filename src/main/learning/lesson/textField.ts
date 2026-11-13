import { z } from 'zod';

export function textField(most: number) {
  return z.string().superRefine((value, ctx) => {
    const length = Array.from(value).length;
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'is missing' });
    } else if (length > most) {
      ctx.addIssue({ code: 'custom', message: `is ${String(length)} characters, want at most ${String(most)}` });
    }
  });
}
