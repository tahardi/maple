import type { QuizQuestion } from '@shared/types/learning/quizQuestion';
import type { QuizResult } from '@shared/types/learning/quizResult';
import { errorText } from '@shared/errors/errorText';
import { useId, useState } from 'react';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './LessonPage.module.css';

export function QuizView({ path, questions }: { path: string; questions: readonly QuizQuestion[] }) {
  const id = useId();
  const [answers, setAnswers] = useState<readonly (number | null)[]>(() => questions.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = questions.map((_, i) => answers.at(i) ?? null);
  const complete = chosen.every((a) => a !== null);

  const submit = () => {
    const picked = chosen.flatMap((a) => (a === null ? [] : [a]));
    setBusy(true);
    setError(null);
    window.maple.learning
      .grade(path, picked)
      .then(setResult)
      .catch((err: unknown) => {
        setError(errorText(err));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const retry = () => {
    setAnswers(questions.map(() => null));
    setResult(null);
  };

  return (
    <div className={styles.quiz}>
      {questions.map((q, i) => {
        const mark = result?.results.at(i) ?? null;
        return (
          <fieldset key={i} className={styles.question} disabled={result !== null}>
            <legend>{q.question}</legend>
            {q.choices.map((choice, c) => (
              <label key={c} className={styles.choice}>
                <input
                  type="radio"
                  name={`${id}-${String(i)}`}
                  checked={chosen[i] === c}
                  onChange={() => {
                    setAnswers(chosen.map((a, n) => (n === i ? c : a)));
                  }}
                />
                {choice}
              </label>
            ))}
            {mark !== null && (
              <div className={styles.mark}>
                {mark.correct ? <Badge tone="success">Correct</Badge> : <Badge tone="danger">Wrong</Badge>}
                {!mark.correct && <p>Right answer: {q.choices.at(mark.answer)}</p>}
                <p>{mark.why}</p>
              </div>
            )}
          </fieldset>
        );
      })}
      {error !== null && <Notice tone="danger">{error}</Notice>}
      {result === null ? (
        <div className={styles.actions}>
          <Button
            label="Submit"
            busy={busy}
            busyLabel="Grading…"
            disabled={!complete}
            reason={complete ? null : 'Answer every question'}
            onClick={submit}
          />
        </div>
      ) : (
        <div className={styles.actions}>
          <p className={styles.score}>
            {result.score} of {result.total}
          </p>
          <Button label="Try again" onClick={retry} />
        </div>
      )}
    </div>
  );
}
