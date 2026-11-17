import { z } from 'zod';
import { listOf } from './listOf';
import { textField } from './textField';

const questionSchema = z
  .object({
    question: textField(300),
    choices: listOf(textField(200), 2, 5),
    answer: z.int(),
    why: textField(600),
  })
  .superRefine(({ choices, answer }, ctx) => {
    if (answer < 0 || answer >= choices.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['answer'],
        message: `answer ${String(answer)} is not a choice index (${String(choices.length)} choices)`,
      });
    }
  });

export const quizSchema = z.object({ questions: listOf(questionSchema, 3, 5) });

export type QuizKey = z.infer<typeof quizSchema>;
