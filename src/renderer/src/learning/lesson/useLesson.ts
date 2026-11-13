import type { Fetched } from '@shared/types/app/fetched';
import type { Lesson } from '@shared/types/learning/lesson';
import { errorText } from '@shared/errors/errorText';
import { useEffect, useState } from 'react';

const EMPTY: Fetched<Lesson> = { data: null, error: null, fetchedAt: null };

export function useLesson(path: string): Fetched<Lesson> {
  const [lesson, setLesson] = useState<Fetched<Lesson>>(EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      window.maple.vault.onChanged(() => {
        setVersion((v) => v + 1);
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    window.maple.learning.read(path).then(
      (data) => {
        if (live) {
          setLesson({ data, error: null, fetchedAt: new Date().toISOString() });
        }
      },
      (err: unknown) => {
        if (live) {
          setLesson((l) => ({ ...l, error: errorText(err) }));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [path, version]);

  return lesson;
}
