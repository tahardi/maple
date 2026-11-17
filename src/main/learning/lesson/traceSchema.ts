import { z } from 'zod';
import { listOf } from './listOf';
import { textField } from './textField';

const stepSchema = z.object({
  lines: z.tuple([z.int(), z.int()]),
  text: textField(600),
});

export const traceSchema = z
  .object({
    lang: textField(40),
    code: textField(4000),
    steps: listOf(stepSchema, 2, 12),
  })
  .superRefine((trace, ctx) => {
    const total = trace.code.split('\n').length;
    if (total > 60) {
      ctx.addIssue({ code: 'custom', path: ['code'], message: `is ${String(total)} lines, want at most 60` });
    }
    trace.steps.forEach(({ lines: [first, last] }, n) => {
      const range = `lines ${String(first)}-${String(last)}`;
      const path = ['steps', n, 'lines'];
      if (first < 1 || first > last) {
        ctx.addIssue({ code: 'custom', path, message: `${range} are not a 1-based range` });
      } else if (last > total) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `${range} are past the end of the code (${String(total)} lines)`,
        });
      }
    });
  });
