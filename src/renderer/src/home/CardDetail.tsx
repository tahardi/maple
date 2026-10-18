import type { Card, TabState } from '@shared/types';
import { MarkdownText } from '../shell/MarkdownText';
import styles from './CardDetail.module.css';

type Props = {
  card: Card;
  tab: TabState | null;
  failure: string | null;
  onStart: () => void;
  onOpen: () => void;
  onGoTo: () => void;
  onClose: () => void;
};

function action(card: Card, tab: TabState | null, props: Props): { label: string; run: () => void } | null {
  if (tab) {
    return { label: 'Go to tab', run: props.onGoTo };
  }
  if (card.status === 'To Do') {
    return { label: 'Start', run: props.onStart };
  }
  if (card.status === 'In Progress' || card.status === 'In Review') {
    return { label: 'Open', run: props.onOpen };
  }
  return null;
}

export function CardDetail(props: Props) {
  const { card, tab, failure, onClose } = props;
  const next = action(card, tab, props);

  return (
    <aside className={styles.detail}>
      <div className={styles.top}>
        <h3>{`${card.key} ${card.summary}`}</h3>
        <button onClick={onClose}>Close</button>
      </div>
      <div className={styles.meta}>
        <span>{card.status}</span>
        {card.points !== null && <span>{`${String(card.points)} pts`}</span>}
        {card.labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {card.blockedBy.length > 0 && (
        <ul className={styles.blockers}>
          {card.blockedBy.map((b) => (
            <li key={b.key}>{`${b.key} ${b.status}`}</li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        {next && <button onClick={next.run}>{next.label}</button>}
        <a href={card.url} target="_blank" rel="noreferrer">
          Open in Jira
        </a>
      </div>
      {failure !== null && (
        <p role="alert" className={styles.failure}>
          {failure}
        </p>
      )}
      <MarkdownText text={card.descriptionMd} />
    </aside>
  );
}
