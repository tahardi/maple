import { SUGGEST_PROMPT } from '@shared/prompts';
import { useEffect, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import styles from './PlannerPane.module.css';

type Props = {
  projectKey: string;
  onBatch: (keys: string[]) => void;
  batch: readonly string[];
  onStartAll: () => void;
};

export function PlannerPane({ projectKey, onBatch, batch, onStartAll }: Props) {
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
        {batch.length > 0 && <button onClick={onStartAll}>{`Start all ${String(batch.length)}`}</button>}
        {answered && batch.length === 0 && <span className={styles.nothing}>Nothing to start right now</span>}
      </div>
      {tabId !== null && <ClaudePane tabId={tabId} actions={[]} />}
    </div>
  );
}
