import { useRef, useState } from 'react';
import styles from './TerminalPane.module.css';
import { TerminalView } from './TerminalView';

export function TerminalPane({ tabId }: { tabId: string }) {
  const [ids, setIds] = useState<readonly string[]>([tabId]);
  const [active, setActive] = useState(tabId);
  const [next, setNext] = useState(2);
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const cancelled = useRef(false);

  const label = (id: string) => names[id] ?? (id === tabId ? '1' : id.slice(tabId.length + 1));

  const without = (id: string) => Object.fromEntries(Object.entries(names).filter(([other]) => other !== id));

  const rename = (id: string, name: string): void => {
    const trimmed = name.trim();
    const rest = without(id);
    setNames(trimmed === '' ? rest : { ...rest, [id]: trimmed });
    setEditing(null);
  };

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
    setNames(without(id));
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
            {editing === id ? (
              <input
                aria-label="Terminal name"
                defaultValue={label(id)}
                autoFocus
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    rename(id, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    cancelled.current = true;
                    setEditing(null);
                  }
                }}
                onBlur={(e) => {
                  if (!cancelled.current) {
                    rename(id, e.currentTarget.value);
                  }
                }}
              />
            ) : (
              <button
                aria-pressed={id === active}
                onClick={() => {
                  setActive(id);
                }}
                onDoubleClick={() => {
                  cancelled.current = false;
                  setEditing(id);
                }}
              >
                {label(id)}
              </button>
            )}
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
