import { useState } from 'react';
import { AttackPath } from '@renderer/security/visual/AttackPath';
import { AttackerReach } from '@renderer/security/visual/AttackerReach';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Notice } from '@renderer/shell/blocks/Notice';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { ExampleView } from './ExampleView';
import { LessonModeToggle } from './LessonModeToggle';
import { LessonSteps } from './LessonSteps';
import { QuizView } from './QuizView';
import { TraceView } from './TraceView';
import { useLesson } from './useLesson';
import styles from './LessonPage.module.css';

const FIX = 'Ask the Learning session to fix it.';

export function LessonPage({ path }: { path: string }) {
  const { data: lesson, error } = useLesson(path);
  const [chosen, setChosen] = useState<boolean | null>(null);

  if (lesson === null) {
    return (
      <div className={styles.page}>
        {error === null ? <p>Loading lesson…</p> : <Notice tone="danger">{error}</Notice>}
      </div>
    );
  }

  const { summary } = lesson;
  if (chosen === null) {
    setChosen(summary.status !== 'to-learn');
  }
  const onePage = chosen ?? summary.status !== 'to-learn';
  const { trace } = lesson;
  const steps = [
    {
      name: 'What it is',
      pages: 1,
      body: () => (
        <>
          {lesson.explanation === null ? <p>Not written yet.</p> : <MarkdownText text={lesson.explanation} />}
          {lesson.example !== null && <ExampleView example={lesson.example} />}
        </>
      ),
    },
    {
      name: 'The attack',
      pages: 1,
      body: () => (
        <>
          {lesson.attack === null ? <p>Not written yet.</p> : <MarkdownText text={lesson.attack} />}
          {lesson.path !== null && <AttackPath steps={lesson.path} />}
        </>
      ),
    },
    {
      name: 'Walk the code',
      pages: trace === null ? 1 : trace.steps.length,
      body: (page: number | null) =>
        trace === null ? (
          <Notice tone="danger">{`${lesson.traceError ?? 'reading lesson: trace: missing'}. ${FIX}`}</Notice>
        ) : (
          <TraceView trace={trace} step={page} />
        ),
    },
    {
      name: 'Your finding',
      pages: 1,
      body: () => (
        <>
          {lesson.findings.length === 0 ? (
            <p>No findings yet.</p>
          ) : (
            <ul className={styles.findings} aria-label="Your finding">
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
                  {f.reach !== null && <AttackerReach now={f.reach.now} afterFix={f.reach.afterFix} />}
                </li>
              ))}
            </ul>
          )}
          {lesson.source !== null && (
            <p className={styles.source}>
              Source:{' '}
              <a href={lesson.source.url} target="_blank" rel="noreferrer">
                {lesson.source.title}
              </a>
            </p>
          )}
        </>
      ),
    },
    {
      name: 'Quiz',
      pages: 1,
      body: () =>
        lesson.quiz === null ? (
          <Notice tone="danger">{`${lesson.quizError ?? 'reading lesson: quiz: missing'}. ${FIX}`}</Notice>
        ) : (
          <QuizView path={path} questions={lesson.quiz} />
        ),
    },
  ];

  return (
    <div className={styles.page}>
      {error !== null && <Notice tone="danger">{error}</Notice>}
      <h1>{summary.title}</h1>
      <div className={styles.top}>
        <div className={styles.badges}>
          {summary.status === 'to-learn' ? (
            <Badge tone="warning">To learn</Badge>
          ) : (
            <Badge tone="success">Learned</Badge>
          )}
          {summary.comfortable && <Badge>Comfortable</Badge>}
          {summary.lastGrade !== null && (
            <Badge>
              Last quiz {summary.lastGrade.score}/{summary.lastGrade.total} on {summary.lastGrade.date}
            </Badge>
          )}
        </div>
        <LessonModeToggle onePage={onePage} onChange={setChosen} />
      </div>
      <LessonSteps steps={steps} onePage={onePage} />
    </div>
  );
}
