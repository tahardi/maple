export type ReviewSource = {
  path: string;
  title: string;
  questions: number;
  grades: { date: string }[];
  reviews: { date: string; question: number; right: boolean }[];
};

export type ReviewPick = { path: string; index: number };

const PICKS = 2;

function lastSeen(note: ReviewSource): string {
  return [...note.grades, ...note.reviews].reduce((last, { date }) => (date > last ? date : last), '');
}

function missedLast(note: ReviewSource): boolean {
  return note.reviews.at(-1)?.right === false;
}

function question(note: ReviewSource, random: () => number): number {
  const counts = Array.from({ length: note.questions }, (_, i) => note.reviews.filter((r) => r.question === i).length);
  const fewest = Math.min(...counts);
  const tied = counts.flatMap((count, i) => (count === fewest ? [i] : []));
  return tied[Math.min(Math.floor(random() * tied.length), tied.length - 1)];
}

export function pickReview(notes: readonly ReviewSource[], current: string, random: () => number): ReviewPick[] {
  return notes
    .filter((n) => n.path !== current && n.questions > 0 && n.grades.length > 0)
    .map((n) => ({ note: n, missed: missedLast(n), seen: lastSeen(n) }))
    .sort((a, b) => Number(b.missed) - Number(a.missed) || a.seen.localeCompare(b.seen))
    .slice(0, PICKS)
    .map(({ note }) => ({ path: note.path, index: question(note, random) }));
}
