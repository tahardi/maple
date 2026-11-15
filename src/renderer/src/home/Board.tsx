import type { JiraStatus } from '@shared/types/jira/jiraStatus';
import type { Sprint } from '@shared/types/jira/sprint';
import type { ReactNode } from 'react';
import styles from './Board.module.css';
import { CardTile } from './CardTile';
import { useDoneOpen } from './useDoneOpen';

type Props = {
  projectKey: string;
  sprint: Sprint;
  selected: ReadonlySet<string>;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
  openKeys: ReadonlySet<string>;
  starting: ReadonlySet<string>;
  onStart: (key: string) => void;
  queued: readonly string[];
  status: ReactNode;
};

const COLUMNS: readonly JiraStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Board({
  projectKey,
  sprint,
  selected,
  onSelect,
  onToggle,
  openKeys,
  starting,
  onStart,
  queued,
  status,
}: Props) {
  const done = sprint.cards.filter((c) => c.status === 'Done').length;
  const doneOpen = useDoneOpen(projectKey);

  return (
    <div className={styles.board}>
      <header className={styles.header}>
        <h2>{sprint.name}</h2>
        <span>{`${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}`}</span>
        <span>{`${String(done)} of ${String(sprint.cards.length)} done`}</span>
        <div className={styles.status}>{status}</div>
      </header>
      <div className={styles.columns} data-done-open={doneOpen.open ? 'true' : 'false'}>
        {COLUMNS.map((column) => {
          const cards = sprint.cards.filter((c) => c.status === column);
          const title = (
            <>
              {column} <span className={styles.count}>{cards.length}</span>
            </>
          );
          const shown = column !== 'Done' || doneOpen.open;
          return (
            <section key={column} aria-label={column} className={styles.column}>
              <h3>
                {column === 'Done' ? (
                  <button
                    className={styles.toggle}
                    aria-expanded={doneOpen.open}
                    aria-label={doneOpen.open ? 'Collapse Done column' : 'Expand Done column'}
                    onClick={doneOpen.toggle}
                  >
                    {title}
                  </button>
                ) : (
                  title
                )}
              </h3>
              {shown &&
                cards.map((c) => (
                  <CardTile
                    key={c.key}
                    card={c}
                    selected={selected.has(c.key)}
                    onSelect={onSelect}
                    onToggle={column === 'To Do' && !queued.includes(c.key) ? onToggle : null}
                    onStart={column === 'To Do' && !openKeys.has(c.key) ? onStart : null}
                    starting={starting.has(c.key)}
                    queued={queued}
                  />
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
