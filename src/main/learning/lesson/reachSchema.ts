import { z } from 'zod';
import { listOf } from './listOf';
import { textField } from './textField';

export const reachSchema = z.object({
  now: listOf(textField(120), 1, 4),
  afterFix: listOf(textField(120), 0, 4),
});
