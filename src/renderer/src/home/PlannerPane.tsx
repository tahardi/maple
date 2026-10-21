import { SUGGEST_PROMPT } from '@shared/prompts';
import { useEffect, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import styles from './PlannerPane.module.css';

type Props = {
  projectKey: string;
  onBatch: (keys: string[]) => void;
  selected: readonly string[];
  readyCount: number;
  onSelectReady: () => void;
  onStart: () => void;
  onClear: () => void;
  toAccept: readonly string[];
  onAccept: () => void;
  onAcceptAndStart: () => void;
  failure: string | null;
};

export function PlannerPane({
  projectKey,
  onBatch,
  selected,
  readyCount,
  onSelectReady,
  onStart,
  onClear,
  toAccept,
  onAccept,
  onAcceptAndStart,
  failure,
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
    window.maple.session.sendPrompt(tabId, SUGGEST_PROMPT(projectKey));
  };

  return (
    <div className={styles.planner}>
      <div className={styles.bar}>
        <button onClick={suggest} disabled={tabId === null}>
          Suggest next batch
        </button>
        <button onClick={onSelectReady} disabled={readyCount === 0}>{`Select ready (${String(readyCount)})`}</button>
        {selected.length > 0 && (
          <>
            <button onClick={onStart}>{`Start (${String(selected.length)})`}</button>
            <button onClick={onClear}>Clear</button>
          </>
        )}
        {toAccept.length > 0 && (
          <>
            <button onClick={onAccept}>{`Accept ${String(toAccept.length)}`}</button>
            <button onClick={onAcceptAndStart}>{`Accept ${String(toAccept.length)} and start all`}</button>
          </>
        )}
        {answered && selected.length === 0 && toAccept.length === 0 && (
          <span className={styles.nothing}>Nothing to start right now</span>
        )}
        {failure !== null && (
          <span role="alert" className={styles.failure}>
            {failure}
          </span>
        )}
      </div>
      {tabId !== null && <ClaudePane tabId={tabId} actions={[]} />}
    </div>
  );
}
