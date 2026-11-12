import type { Card } from '@shared/types/jira/card';
import type { TabState } from '@shared/types/tabs/tabState';
import { useEffect, useRef } from 'react';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { EpicLozenge } from './EpicLozenge';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './CardDetail.module.css';

type Props = {
  card: Card;
  tab: TabState | null;
  failure: string | null;
  busy: boolean;
  onStart: () => void;
  onOpen: () => void;
  onGoTo: () => void;
  onClose: () => void;
  onAddToSprint?: (() => void) | null;
};

type Action = { label: string; busyLabel?: string; run: () => void };

function action(card: Card, tab: TabState | null, props: Props): Action | null {
  if (tab) {
    return { label: 'Go to tab', run: props.onGoTo };
  }
  if (card.status === 'To Do') {
    return { label: 'Start', busyLabel: 'Starting…', run: props.onStart };
  }
  if (card.status === 'In Progress' || card.status === 'In Review') {
    return { label: 'Open', busyLabel: 'Opening…', run: props.onOpen };
  }
  return null;
}

export function CardDetail(props: Props) {
  const { card, tab, failure, busy, onClose, onAddToSprint } = props;
  const next = action(card, tab, props);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const visible = ref.current?.closest('[hidden]') === null;
      const dialogOpen = document.querySelector('dialog[open]') !== null;
      if (e.key === 'Escape' && !e.defaultPrevented && visible && !dialogOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <aside
      ref={ref}
      className={styles.detail}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div className={styles.top}>
        <h3>{`${card.key} ${card.summary}`}</h3>
        <button className={styles.close} aria-label="Close details" title="Close details" onClick={onClose}>
          ×
        </button>
      </div>
      <div className={styles.meta}>
        {card.epic && <EpicLozenge epic={card.epic} />}
        <Badge>{card.status}</Badge>
        {card.points !== null && <span>{`${String(card.points)} pts`}</span>}
        {card.labels.map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
      </div>
      {card.blockedBy.some((b) => b.status !== 'Done') && (
        <>
          <h4 className={styles.blockedBy}>Blocked by</h4>
          <ul className={styles.blockers}>
            {card.blockedBy.map((b) => (
              <li key={b.key}>{`${b.key} ${b.status}`}</li>
            ))}
          </ul>
        </>
      )}
      <div className={styles.actions}>
        {onAddToSprint !== undefined ? (
          <Button
            label="Add to sprint"
            variant="primary"
            onClick={onAddToSprint ?? undefined}
            disabled={onAddToSprint === null}
            reason={onAddToSprint === null ? 'No active sprint' : null}
            busy={busy}
            busyLabel="Moving…"
          />
        ) : (
          next && (
            <Button label={next.label} variant="primary" onClick={next.run} busy={busy} busyLabel={next.busyLabel} />
          )
        )}
        <a href={card.url} target="_blank" rel="noreferrer">
          Open in Jira
        </a>
      </div>
      {failure !== null && <Notice tone="danger">{failure}</Notice>}
      <MarkdownText text={card.descriptionMd} />
    </aside>
  );
}
