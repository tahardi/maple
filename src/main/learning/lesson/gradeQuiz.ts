import type { QuizResult } from '@shared/types/learning/quizResult';
import type { QuizKey } from './quizSchema';

export function gradeQuiz(key: QuizKey, answers: readonly number[]): QuizResult {
  const total = key.questions.length;
  if (answers.length !== total) {
    throw new Error(`grading quiz: expected ${String(total)} answers, got ${String(answers.length)}`);
  }
  const results = key.questions.map(({ answer, why }, i) => ({ correct: answers[i] === answer, answer, why }));
  return { score: results.filter((r) => r.correct).length, total, results };
}
