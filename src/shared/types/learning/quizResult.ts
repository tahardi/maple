export type QuizAnswerResult = {
  correct: boolean;
  answer: number;
  why: string;
};

export type QuizResult = {
  score: number;
  total: number;
  results: QuizAnswerResult[];
};
