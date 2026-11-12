import { refinePrompt } from '@shared/prompts/refinePrompt';
import { suggestPrompt } from '@shared/prompts/suggestPrompt';
import { useEffect, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './PlannerPane.module.css';

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
  busy: 'start' | 'accept' | 'acceptAndStart' | null;
  width: number;
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
  busy,
  width,
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

  const running = busy !== null;
  const nothingToStart = answered && selected.length === 0 && toAccept.length === 0;

  return (
    <div className={styles.planner} style={{ width: `${String(width)}%` }} data-testid="planner">
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
          <button onClick={onSelectReady} disabled={readyCount === 0 || running}>
            {`Select ready (${String(readyCount)})`}
          </button>
          {selected.length > 0 && (
            <>
              <Button
                label={`Start ${String(selected.length)} selected`}
                variant="primary"
                onClick={onStart}
                disabled={running}
                busy={busy === 'start'}
                busyLabel="Starting…"
              />
              <button onClick={onClear} disabled={running}>
                Clear
              </button>
            </>
          )}
          {toAccept.length > 0 && (
            <>
              <Button
                label={`Accept ${String(toAccept.length)}`}
                onClick={onAccept}
                disabled={running}
                busy={busy === 'accept'}
                busyLabel="Moving…"
              />
              <Button
                label={`Accept ${String(toAccept.length)} and start all`}
                variant="primary"
                onClick={onAcceptAndStart}
                disabled={running}
                busy={busy === 'acceptAndStart'}
                busyLabel="Starting…"
              />
            </>
          )}
        </div>
      </div>
      {(nothingToStart || failure !== null) && (
        <div className={styles.status}>
          {nothingToStart && <span className={styles.nothing}>Nothing to start right now</span>}
          {failure !== null && <Notice tone="danger">{failure}</Notice>}
        </div>
      )}
      {tabId !== null && <ClaudePane tabId={tabId} actions={[]} />}
    </div>
  );
}
