import type { BacklogGroup } from '@shared/types/jira';
import styles from './Backlog.module.css';

type Props = { groups: readonly BacklogGroup[]; highlighted?: readonly string[]; onSelect: (key: string) => void };

export function Backlog({ groups, highlighted = [], onSelect }: Props) {
  const count = groups.reduce((sum, g) => sum + g.cards.length, 0);

  return (
    <details className={styles.backlog}>
      <summary className={styles.summary}>{`Backlog (${String(count)})`}</summary>
      {groups.length === 0 && <p className={styles.empty}>Nothing in the backlog</p>}
      {groups.map((group) => (
        <section key={group.epic?.key ?? ''} className={styles.group}>
          <h3>{group.epic ? `${group.epic.key} ${group.epic.summary}` : 'No epic'}</h3>
          <ul>
            {group.cards.map((card) => (
              <li
                key={card.key}
                className={styles.card}
                data-highlighted={highlighted.includes(card.key) ? 'true' : undefined}
              >
                <button
                  className={styles.button}
                  onClick={() => {
                    onSelect(card.key);
                  }}
                >
                  <span className={styles.key}>{card.key}</span>
                  <span>{card.summary}</span>
                  {card.points !== null && <span className={styles.points}>{`${String(card.points)} pts`}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}
