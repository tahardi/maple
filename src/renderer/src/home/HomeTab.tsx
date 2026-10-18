import type { TabState } from '@shared/types';
import { useState } from 'react';
import { useMaple } from '../store';
import { Board } from './Board';
import { CardDetail } from './CardDetail';
import styles from './HomeTab.module.css';
import { PlannerPane } from './PlannerPane';
import { useSprint } from './useSprint';

type Props = { projectKey: string };

function staleMessage(fetchedAt: string | null): string {
  if (fetchedAt === null) {
    return 'Jira unreachable';
  }
  const at = new Date(fetchedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Jira unreachable, last updated ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function HomeTab({ projectKey }: Props) {
  const { sprint } = useSprint(projectKey);
  const tabs = useMaple((s) => s.tabs);
  const activate = useMaple((s) => s.activate);
  const [selected, setSelected] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<readonly string[]>([]);
  const toDo = new Set(sprint?.data?.cards.filter((c) => c.status === 'To Do').map((c) => c.key));
  const batch = suggested.filter((key) => toDo.has(key));
  const card = sprint?.data?.cards.find((c) => c.key === selected) ?? null;
  const tabFor = (key: string) =>
    tabs.find((t) => t.kind === 'card' && t.projectKey === projectKey && t.cardKey === key) ?? null;
  const activateTab = (tab: TabState) => {
    activate(tab.id);
  };
  const startAll = async () => {
    const started: TabState[] = [];
    for (const key of batch) {
      started.push(await window.maple.tabs.startCard(projectKey, key));
    }
    if (started[0]) {
      activateTab(started[0]);
    }
  };

  return (
    <div className={styles.home} data-testid="home">
      <div className={styles.main}>
        {sprint && sprint.error !== null && (
          <div role="status" className={styles.stale}>
            {staleMessage(sprint.fetchedAt)}
          </div>
        )}
        {sprint?.data ? (
          <Board sprint={sprint.data} highlighted={new Set(batch)} onSelect={setSelected} />
        ) : (
          sprint?.error === null && <p className={styles.empty}>No active sprint</p>
        )}
      </div>
      {card && (
        <CardDetail
          card={card}
          tab={tabFor(card.key)}
          onStart={() => void window.maple.tabs.startCard(projectKey, card.key).then(activateTab)}
          onOpen={() => void window.maple.tabs.openCard(projectKey, card.key).then(activateTab)}
          onGoTo={() => {
            const tab = tabFor(card.key);
            if (tab) {
              activateTab(tab);
            }
          }}
          onClose={() => {
            setSelected(null);
          }}
        />
      )}
      <PlannerPane projectKey={projectKey} onBatch={setSuggested} batch={batch} onStartAll={() => void startAll()} />
    </div>
  );
}
