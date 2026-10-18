import type { JiraStatus, Sprint } from '@shared/types';
import styles from './Board.module.css';
import { CardTile } from './CardTile';

type Props = { sprint: Sprint; highlighted: ReadonlySet<string>; onSelect: (key: string) => void };

const COLUMNS: readonly JiraStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Board({ sprint, highlighted, onSelect }: Props) {
  const done = sprint.cards.filter((c) => c.status === 'Done').length;

  return (
    <div className={styles.board}>
      <header className={styles.header}>
        <h2>{sprint.name}</h2>
        <span>{`${shortDate(sprint.startDate)} – ${shortDate(sprint.endDate)}`}</span>
        <span>{`${String(done)} of ${String(sprint.cards.length)} done`}</span>
      </header>
      <div className={styles.columns}>
        {COLUMNS.map((status) => (
          <section key={status} aria-label={status} className={styles.column}>
            <h3>{status}</h3>
            {sprint.cards
              .filter((c) => c.status === status)
              .map((c) => (
                <CardTile key={c.key} card={c} highlighted={highlighted.has(c.key)} onSelect={onSelect} />
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
