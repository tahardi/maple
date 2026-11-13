import { useState } from 'react';
import type { Finding } from '@shared/types/findings/finding';
import type { FindingLesson } from '@shared/types/findings/findingLesson';
import { errorText } from '@shared/errors/errorText';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import styles from './FindingCard.module.css';

type LearnButtonsProps = { tabId: string; finding: Finding; working: boolean };

type Pending = FindingLesson['mode'] | 'open';

export function LearnButtons({ tabId, finding, working }: LearnButtonsProps) {
  const vaultDir = useMaple((s) => s.config?.data?.vaultDir ?? null);
  const projectKey = useMaple((s) => s.tabs.find((t) => t.id === tabId)?.projectKey ?? null);
  const learningTabId = useMaple(
    (s) => s.tabs.find((t) => t.kind === 'learning' && t.projectKey === projectKey)?.id ?? null,
  );
  const learningBusy = useMaple(
    (s) => learningTabId !== null && learningTabId in s.statuses && s.statuses[learningTabId].dot === 'working',
  );
  const showLesson = useMaple((s) => s.showLesson);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (vaultDir === null) {
    return null;
  }

  const run = async (what: Pending, call: () => Promise<void>): Promise<void> => {
    setPending(what);
    setError(null);
    try {
      await call();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(null);
    }
  };

  const learn = (mode: FindingLesson['mode']) =>
    run(mode, async () => {
      const got = await window.maple.learning.fromFinding(tabId, finding.id, mode);
      if (got.learningTabId !== null) {
        showLesson(got.learningTabId, got.note);
      }
    });

  const open = (note: string) =>
    run('open', async () => {
      if (learningTabId !== null) {
        showLesson(learningTabId, note);
      } else if (projectKey !== null) {
        showLesson((await window.maple.tabs.openLearning(projectKey)).id, note);
      }
    });

  const lesson = finding.lesson ?? null;
  const nowReason = working ? 'Claude is working' : learningBusy ? 'The Learning session is busy' : null;
  const laterReason = working ? 'Claude is working' : null;

  return (
    <div className={styles.decisions}>
      <div className={styles.buttons}>
        {lesson?.mode !== 'now' && (
          <Button
            label="Learn now"
            disabled={nowReason !== null || pending !== null}
            reason={nowReason}
            busy={pending === 'now'}
            busyLabel="Saving…"
            onClick={() => void learn('now')}
          />
        )}
        {lesson === null && (
          <Button
            label="Learn later"
            disabled={laterReason !== null || pending !== null}
            reason={laterReason}
            busy={pending === 'later'}
            busyLabel="Saving…"
            onClick={() => void learn('later')}
          />
        )}
        {lesson !== null && (
          <>
            <span className={styles.locked}>Lesson saved</span>
            <Button
              label="Open lesson"
              disabled={pending !== null}
              busy={pending === 'open'}
              busyLabel="Opening…"
              onClick={() => void open(lesson.note)}
            />
          </>
        )}
      </div>
      {error !== null && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
