import type { Card, TabState } from '@shared/types';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './CardDetail.module.css';

type Props = {
  card: Card;
  tab: TabState | null;
  onStart: () => void;
  onOpen: () => void;
  onGoTo: () => void;
  onClose: () => void;
};

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
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
  const { card, tab, onClose } = props;
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
      <div className={styles.description}>
        <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {card.descriptionMd}
        </Markdown>
      </div>
    </aside>
  );
}
