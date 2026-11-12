import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { errorText } from '@shared/errors/errorText';
import { useEffect, useState } from 'react';

type Lessons = { lessons: LessonSummary[]; error: string | null };

export function useLessons(): Lessons {
  const [state, setState] = useState<Lessons>({ lessons: [], error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    const unsubscribe = window.maple.vault.onChanged(() => {
      setVersion((v) => v + 1);
    });
    window.maple.learning.list().then(
      (lessons) => {
        if (live) {
          setState({ lessons, error: null });
        }
      },
      (err: unknown) => {
        if (live) {
          setState((s) => ({ ...s, error: errorText(err) }));
        }
      },
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, [version]);

  return state;
}
