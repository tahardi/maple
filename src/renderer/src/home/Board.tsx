import type { JiraStatus } from '@shared/types/jira/jiraStatus';
import type { Sprint } from '@shared/types/jira/sprint';
import styles from './Board.module.css';
import { CardTile } from './CardTile';
import { useDoneOpen } from './useDoneOpen';

type Props = {
  projectKey: string;
  sprint: Sprint;
  selected: ReadonlySet<string>;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
};

const COLUMNS: readonly JiraStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Board({ projectKey, sprint, selected, onSelect, onToggle }: Props) {
  const done = sprint.cards.filter((c) => c.status === 'Done').length;
  const doneOpen = useDoneOpen(projectKey);

  return (
    <div className={styles.board}>
      <header className={styles.header}>
        <h2>{sprint.name}</h2>
        <span>{`${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}`}</span>
        <span>{`${String(done)} of ${String(sprint.cards.length)} done`}</span>
      </header>
      <div className={styles.columns} data-done-open={doneOpen.open ? 'true' : 'false'}>
        {COLUMNS.map((status) => {
          const cards = sprint.cards.filter((c) => c.status === status);
          const title = (
            <>
              {status}
              <span className={styles.count}>{cards.length}</span>
            </>
          );
          const shown = status !== 'Done' || doneOpen.open;
          return (
            <section key={status} aria-label={status} className={styles.column}>
              <h3>
                {status === 'Done' ? (
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
                    onToggle={status === 'To Do' ? onToggle : null}
                  />
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
