import { useId } from 'react';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Notice } from '@renderer/shell/blocks/Notice';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { QuizView } from './QuizView';
import { TraceView } from './TraceView';
import { useLesson } from './useLesson';
import styles from './LessonPage.module.css';

const FIX = 'Ask the Learning session to fix it.';

export function LessonPage({ path }: { path: string }) {
  const { data: lesson, error } = useLesson(path);
  const findingsId = useId();

  if (lesson === null) {
    return (
      <div className={styles.page}>
        {error === null ? <p>Loading lesson…</p> : <Notice tone="danger">{error}</Notice>}
      </div>
    );
  }

  const { summary } = lesson;
  return (
    <div className={styles.page}>
      {error !== null && <Notice tone="danger">{error}</Notice>}
      <h1>{summary.title}</h1>
      <div className={styles.badges}>
        {summary.status === 'to-learn' ? <Badge tone="warning">To learn</Badge> : <Badge tone="success">Learned</Badge>}
        {summary.comfortable && <Badge>Comfortable</Badge>}
        {summary.lastGrade !== null && (
          <Badge>
            Last quiz {summary.lastGrade.score}/{summary.lastGrade.total} on {summary.lastGrade.date}
          </Badge>
        )}
      </div>
      <h2>What it is</h2>
      {lesson.explanation === null ? <p>Not written yet.</p> : <MarkdownText text={lesson.explanation} />}
      <h2>How an attack works</h2>
      {lesson.attack === null ? <p>Not written yet.</p> : <MarkdownText text={lesson.attack} />}
      <h2>Code walk</h2>
      {lesson.trace === null ? (
        <Notice tone="danger">{`${lesson.traceError ?? 'reading lesson: trace: missing'}. ${FIX}`}</Notice>
      ) : (
        <TraceView trace={lesson.trace} />
      )}
      <h2>Quiz</h2>
      {lesson.quiz === null ? (
        <Notice tone="danger">{`${lesson.quizError ?? 'reading lesson: quiz: missing'}. ${FIX}`}</Notice>
      ) : (
        <QuizView path={path} questions={lesson.quiz} />
      )}
      <h2 id={findingsId}>Findings</h2>
      {lesson.findings.length === 0 ? (
        <p>No findings yet.</p>
      ) : (
        <ul className={styles.findings} aria-labelledby={findingsId}>
          {lesson.findings.map((f) => (
            <li key={`${f.card} ${f.date} ${f.title}`}>
              <h3>{`${f.date} ${f.card}: ${f.title}`}</h3>
              {f.pr === null ? (
                <p>No PR yet</p>
              ) : (
                <a href={f.pr} target="_blank" rel="noreferrer">
                  {f.pr}
                </a>
              )}
              {f.tieIn === null ? <p>Tie-in pending</p> : <MarkdownText text={f.tieIn} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
