import { useState } from 'react';
import styles from './TerminalPane.module.css';
import { TerminalView } from './TerminalView';

export function TerminalPane({ tabId }: { tabId: string }) {
  const [ids, setIds] = useState<readonly string[]>([tabId]);
  const [active, setActive] = useState(tabId);
  const [next, setNext] = useState(2);

  const label = (id: string) => (id === tabId ? '1' : id.slice(tabId.length + 1));

  const add = () => {
    const id = `${tabId}:${String(next)}`;
    setIds([...ids, id]);
    setActive(id);
    setNext(next + 1);
  };

  const close = (id: string) => {
    const index = ids.indexOf(id);
    const rest = ids.filter((other) => other !== id);
    setIds(rest);
    if (id === active) {
      setActive(rest[Math.max(0, index - 1)] ?? tabId);
    }
    void window.maple.terminal.close(id);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.strip}>
        {ids.map((id) => (
          <span key={id} className={styles.item}>
            <button
              aria-pressed={id === active}
              onClick={() => {
                setActive(id);
              }}
            >
              {label(id)}
            </button>
            {ids.length > 1 && (
              <button
                aria-label={`Close terminal ${label(id)}`}
                onClick={() => {
                  close(id);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button aria-label="New terminal" onClick={add}>
          +
        </button>
      </div>
      <div className={styles.views}>
        {ids.map((id) => (
          <TerminalView key={id} tabId={tabId} terminalId={id} hidden={id !== active} />
        ))}
      </div>
    </div>
  );
}
