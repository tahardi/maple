import { inboxItems, type InboxItem } from '@shared/inbox';
import { useState } from 'react';
import { useMaple } from '../store';
import styles from './Inbox.module.css';
import { tabLabel } from './tabLabel';

function pointsLabel(points: number | null): string {
  return points === null ? '–' : `${String(points)} pts`;
}

export function Inbox() {
  const tabs = useMaple((s) => s.tabs);
  const statuses = useMaple((s) => s.statuses);
  const since = useMaple((s) => s.since);
  const seen = useMaple((s) => s.seen);
  const config = useMaple((s) => s.config);
  const selectProject = useMaple((s) => s.selectProject);
  const activate = useMaple((s) => s.activate);
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<Record<string, number | null>>({});
  const items = inboxItems(tabs, Object.values(statuses), since, seen, points);
  const readyPoints = items.filter((i) => i.dot === 'ready').reduce((sum, i) => sum + (i.points ?? 0), 0);
  const projectName = (key: string) => config?.data?.projects.find((p) => p.jiraKey === key)?.name ?? key;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const keys = [...new Set(items.map((i) => i.projectKey))];
    void Promise.all(keys.map((key) => window.maple.jira.sprint(key))).then((sprints) => {
      const cards = sprints.flatMap((sprint) => sprint.data?.cards ?? []);
      setPoints(Object.fromEntries(cards.map((c) => [c.key, c.points])));
    });
  };

  const go = (item: InboxItem) => {
    setOpen(false);
    selectProject(item.projectKey);
    activate(item.kind === 'planner' ? null : item.tabId);
  };

  return (
    <div className={styles.inbox}>
      <button className={styles.button} onClick={toggle}>
        Inbox {items.length}
      </button>
      {open && (
        <div className={styles.panel}>
          {items.length === 0 ? (
            <p className={styles.empty}>Nothing needs you</p>
          ) : (
            <>
              <p className={styles.header}>Ready: {pointsLabel(readyPoints)}</p>
              <ul className={styles.list}>
                {items.map((item) => (
                  <li key={item.tabId}>
                    <button
                      className={styles.row}
                      onClick={() => {
                        go(item);
                      }}
                    >
                      {[tabLabel(item), projectName(item.projectKey), item.dot].join(' · ')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
