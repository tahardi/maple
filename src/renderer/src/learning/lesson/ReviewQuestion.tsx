import type { QuizAnswerResult } from '@shared/types/learning/quizResult';
import type { ReviewQuestion as Review } from '@shared/types/learning/reviewQuestion';
import { errorText } from '@shared/errors/errorText';
import { useId, useState } from 'react';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './LessonPage.module.css';

export function ReviewQuestion({ review }: { review: Review }) {
  const name = useId();
  const [answer, setAnswer] = useState<number | null>(null);
  const [mark, setMark] = useState<QuizAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = (picked: number) => {
    setBusy(true);
    setError(null);
    window.maple.learning
      .gradeReview(review.path, review.index, picked)
      .then(setMark)
      .catch((err: unknown) => {
        setError(errorText(err));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <fieldset className={`${styles.question} ${styles.review}`} disabled={mark !== null}>
      <legend>Review · {review.title}</legend>
      <p>{review.question}</p>
      {review.choices.map((choice, c) => (
        <label key={c} className={styles.choice}>
          <input
            type="radio"
            name={name}
            checked={answer === c}
            onChange={() => {
              setAnswer(c);
            }}
          />
          {choice}
        </label>
      ))}
      {error !== null && <Notice tone="danger">{error}</Notice>}
      {mark === null ? (
        <div className={styles.actions}>
          <Button
            label="Check"
            busy={busy}
            busyLabel="Grading…"
            disabled={answer === null}
            reason={answer === null ? 'Pick an answer' : null}
            onClick={() => {
              if (answer !== null) {
                check(answer);
              }
            }}
          />
        </div>
      ) : (
        <div className={styles.mark}>
          {mark.correct ? <Badge tone="success">Correct</Badge> : <Badge tone="danger">Wrong</Badge>}
          {!mark.correct && <p>Right answer: {review.choices.at(mark.answer)}</p>}
          <p>{mark.why}</p>
        </div>
      )}
    </fieldset>
  );
}
