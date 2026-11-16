import { z } from 'zod';
import type { QuizKey } from '@main/learning/lesson/quizSchema';
import { parseLesson } from '@main/learning/lesson/parseLesson';
import { readFrontmatter } from '@main/learning/notes/frontmatter';
import type { ReviewSource } from './pickReview';

const gradesSchema = z.array(z.object({ date: z.string() }));
const reviewsSchema = z.array(z.object({ date: z.string(), question: z.int(), right: z.boolean() }));

export function readReviewSource(path: string, text: string): { source: ReviewSource; key: QuizKey } | null {
  try {
    const { lesson, key } = parseLesson(path, text);
    if (key === null) {
      return null;
    }
    const { data } = readFrontmatter(text);
    const grades = gradesSchema.safeParse(data.grades);
    const reviews = reviewsSchema.safeParse(data.reviews);
    const source = {
      path,
      title: lesson.summary.title,
      questions: key.questions.length,
      grades: grades.success ? grades.data : [],
      reviews: reviews.success ? reviews.data : [],
    };
    return { source, key };
  } catch {
    return null;
  }
}
