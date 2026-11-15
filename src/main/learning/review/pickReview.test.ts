import { describe, expect, test } from 'vitest';
import { pickReview, type ReviewSource } from './pickReview';

function note(path: string, fields: Partial<ReviewSource> = {}): ReviewSource {
  return { path, title: path, questions: 3, grades: [{ date: '2026-11-01' }], reviews: [], ...fields };
}

const CURRENT = 'Learning/Security/current.md';

describe('pickReview', () => {
  test.each([
    {
      name: 'no other graded notes give []',
      notes: [note(CURRENT)],
      random: 0,
      want: [],
    },
    {
      name: 'the current note is never picked',
      notes: [note(CURRENT, { grades: [{ date: '2026-01-01' }] }), note('a', { grades: [{ date: '2026-11-10' }] })],
      random: 0,
      want: [{ path: 'a', index: 0 }],
    },
    {
      name: 'an ungraded note is never picked',
      notes: [note('a', { grades: [] }), note('b')],
      random: 0,
      want: [{ path: 'b', index: 0 }],
    },
    {
      name: 'a note with no quiz is never picked',
      notes: [note('a', { questions: 0 }), note('b')],
      random: 0,
      want: [{ path: 'b', index: 0 }],
    },
    {
      name: 'a class whose last review was wrong beats an older one',
      notes: [
        note('old', { grades: [{ date: '2026-01-01' }] }),
        note('older', { grades: [{ date: '2025-01-01' }] }),
        note('wrong', {
          grades: [{ date: '2026-11-01' }],
          reviews: [
            { date: '2026-11-02', question: 0, right: true },
            { date: '2026-11-10', question: 1, right: false },
          ],
        }),
      ],
      random: 0,
      want: [
        { path: 'wrong', index: 2 },
        { path: 'older', index: 0 },
      ],
    },
    {
      name: 'with no wrong reviews, the two oldest last-seen classes are picked',
      notes: [
        note('new', { grades: [{ date: '2026-11-10' }] }),
        note('mid', { grades: [{ date: '2026-01-01' }], reviews: [{ date: '2026-06-01', question: 0, right: true }] }),
        note('old', { grades: [{ date: '2025-01-01' }, { date: '2026-03-01' }] }),
        note('oldest', { grades: [{ date: '2025-06-01' }] }),
      ],
      random: 0,
      want: [
        { path: 'oldest', index: 0 },
        { path: 'old', index: 0 },
      ],
    },
    {
      name: 'a class missed earlier but right last time is not moved to the front',
      notes: [
        note('old', { grades: [{ date: '2025-01-01' }] }),
        note('fixed', {
          grades: [{ date: '2026-11-01' }],
          reviews: [
            { date: '2026-11-02', question: 0, right: false },
            { date: '2026-11-03', question: 1, right: true },
          ],
        }),
        note('mid', { grades: [{ date: '2026-06-01' }] }),
      ],
      random: 0,
      want: [
        { path: 'old', index: 0 },
        { path: 'mid', index: 0 },
      ],
    },
    {
      name: 'three missed classes give two picks, oldest last-seen first',
      notes: [
        note('a', { reviews: [{ date: '2026-11-09', question: 0, right: false }] }),
        note('b', { reviews: [{ date: '2026-11-03', question: 0, right: false }] }),
        note('c', { reviews: [{ date: '2026-11-05', question: 0, right: false }] }),
      ],
      random: 0,
      want: [
        { path: 'b', index: 1 },
        { path: 'c', index: 1 },
      ],
    },
    {
      name: 'one question per class',
      notes: [note('a', { questions: 5 })],
      random: 0,
      want: [{ path: 'a', index: 0 }],
    },
    {
      name: 'the least-reviewed question in a class is picked',
      notes: [
        note('a', {
          reviews: [
            { date: '2026-11-02', question: 0, right: true },
            { date: '2026-11-03', question: 2, right: true },
          ],
        }),
      ],
      random: 0,
      want: [{ path: 'a', index: 1 }],
    },
    {
      name: 'ties between least-reviewed questions go by random',
      notes: [note('a', { reviews: [{ date: '2026-11-02', question: 0, right: true }] })],
      random: 0.99,
      want: [{ path: 'a', index: 2 }],
    },
  ])('$name', ({ notes, random, want }) => {
    // given
    const roll = () => random;
    // when
    const got = pickReview(notes, CURRENT, roll);
    // then
    expect(got).toEqual(want);
  });
});
