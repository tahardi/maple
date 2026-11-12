import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { errorText } from '@shared/errors/errorText';
import { useState } from 'react';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './LessonList.module.css';

const EMPTY = 'No lessons yet. They come from findings: choose Learn now or Learn later on a finding.';

function byStatusThenTitle(a: LessonSummary, b: LessonSummary): number {
  if (a.status !== b.status) {
    return a.status === 'to-learn' ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

export function LessonList({
  lessons,
  selected,
  onSelect,
  onSaved,
}: {
  lessons: readonly LessonSummary[];
  selected: string | null;
  onSelect: (path: string) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ path: string; error: string } | null>(null);

  if (lessons.length === 0) {
    return <p className={styles.empty}>{EMPTY}</p>;
  }

  const setComfortable = (path: string, comfortable: boolean) => {
    setSaving(path);
    setFailed(null);
    window.maple.learning
      .setComfortable(path, comfortable)
      .then(onSaved)
      .catch((err: unknown) => {
        setFailed({ path, error: errorText(err) });
      })
      .finally(() => {
        setSaving(null);
      });
  };

  return (
    <ul className={styles.list}>
      {[...lessons].sort(byStatusThenTitle).map((l) => (
        <li
          key={l.path}
          className={styles.row}
          aria-current={l.path === selected ? true : undefined}
          onClick={() => {
            onSelect(l.path);
          }}
        >
          <button type="button" className={styles.title}>
            {l.title}
          </button>
          <div className={styles.badges}>
            {l.status === 'to-learn' ? <Badge tone="warning">To learn</Badge> : <Badge tone="success">Learned</Badge>}
            {l.comfortable && <Badge>Comfortable</Badge>}
            {l.lastGrade !== null && (
              <Badge>
                Last quiz {l.lastGrade.score}/{l.lastGrade.total} on {l.lastGrade.date}
              </Badge>
            )}
            {l.findings > 0 && <Badge>{l.findings === 1 ? '1 finding' : `${String(l.findings)} findings`}</Badge>}
          </div>
          <div
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Button
              label={l.comfortable ? 'Not comfortable' : 'Mark comfortable'}
              busy={saving === l.path}
              busyLabel="Saving…"
              disabled={l.error !== null}
              reason={l.error === null ? null : "Fix this note's frontmatter first"}
              onClick={() => {
                setComfortable(l.path, !l.comfortable);
              }}
            />
          </div>
          {l.error !== null && <Notice tone="danger">{l.error}</Notice>}
          {failed?.path === l.path && <Notice tone="danger">{failed.error}</Notice>}
        </li>
      ))}
    </ul>
  );
}
