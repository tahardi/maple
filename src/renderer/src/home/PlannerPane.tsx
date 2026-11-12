import { refinePrompt, suggestPrompt } from '@shared/prompts/prompts';
import type { QueueState } from '@shared/types/queue';
import { useEffect, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import styles from './PlannerPane.module.css';
import { StartQueue } from '@renderer/home/startQueue/StartQueue';

type Props = {
  projectKey: string;
  onBatch: (keys: string[]) => void;
  selected: readonly string[];
  readyCount: number;
  refineCount: number;
  onSelectReady: () => void;
  onStart: () => void;
  onClear: () => void;
  toAccept: readonly string[];
  onAccept: () => void;
  onAcceptAndStart: () => void;
  failure: string | null;
  queue: QueueState;
};

export function PlannerPane({
  projectKey,
  onBatch,
  selected,
  readyCount,
  refineCount,
  onSelectReady,
  onStart,
  onClear,
  toAccept,
  onAccept,
  onAcceptAndStart,
  failure,
  queue,
}: Props) {
  const [tabId, setTabId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    let disposed = false;
    void window.maple.tabs.openPlanner(projectKey).then((tab) => {
      if (!disposed) {
        setTabId(tab.id);
      }
    });
    return () => {
      disposed = true;
    };
  }, [projectKey]);

  useEffect(
    () =>
      window.maple.session.onBatch(projectKey, (keys) => {
        setAnswered(true);
        onBatch(keys);
      }),
    [projectKey, onBatch],
  );

  const suggest = () => {
    if (tabId === null) {
      return;
    }
    setAnswered(false);
    onBatch([]);
    window.maple.session.sendPrompt(tabId, suggestPrompt(projectKey));
  };

  const refine = () => {
    if (tabId === null) {
      return;
    }
    window.maple.session.sendPrompt(tabId, refinePrompt(projectKey));
  };

  const nothingToStart = answered && selected.length === 0 && toAccept.length === 0;

  return (
    <div className={styles.planner}>
      <div className={styles.bar}>
        <div role="group" aria-label="Plan" className={styles.group}>
          <button onClick={suggest} disabled={tabId === null}>
            Suggest next batch
          </button>
          <button onClick={refine} disabled={tabId === null || refineCount === 0}>
            {`Refine (${String(refineCount)})`}
          </button>
        </div>
        <div role="group" aria-label="Batch" className={styles.group}>
          <button onClick={onSelectReady} disabled={readyCount === 0}>{`Select ready (${String(readyCount)})`}</button>
          {selected.length > 0 && (
            <>
              <button data-variant="primary" onClick={onStart}>{`Start (${String(selected.length)})`}</button>
              <button onClick={onClear}>Clear</button>
            </>
          )}
          {toAccept.length > 0 && (
            <>
              <button onClick={onAccept}>{`Accept ${String(toAccept.length)}`}</button>
              <button data-variant="primary" onClick={onAcceptAndStart}>
                {`Accept ${String(toAccept.length)} and start all`}
              </button>
            </>
          )}
        </div>
      </div>
      <StartQueue queue={queue} />
      {(nothingToStart || failure !== null) && (
        <div className={styles.status}>
          {nothingToStart && <span className={styles.nothing}>Nothing to start right now</span>}
          {failure !== null && (
            <span role="alert" className={styles.failure}>
              {failure}
            </span>
          )}
        </div>
      )}
      {tabId !== null && <ClaudePane tabId={tabId} actions={[]} />}
    </div>
  );
}
