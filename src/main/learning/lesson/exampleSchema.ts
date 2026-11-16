import { z } from 'zod';
import { textField } from './textField';

const shortText = textField(300).refine((value) => value.split('\n').length <= 3, 'has more than 3 lines');

export const exampleSchema = z
  .object({ lang: textField(40), normal: shortText, attack: shortText, mark: z.string().min(1) })
  .refine(({ attack, mark }) => attack.includes(mark), { path: ['mark'], message: 'is not part of attack' });
