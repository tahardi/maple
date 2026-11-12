import { useEffect, useRef, useState } from 'react';
import styles from './TerminalPane.module.css';
import { TerminalView } from './TerminalView';
import { errorText } from '@shared/errors/errorText';

const MAKE_TRY = 'make try';

export function TerminalPane({
  tabId,
  worktreePath,
  tryRuns,
}: {
  tabId: string;
  worktreePath: string | null;
  tryRuns: number;
}) {
  const [ids, setIds] = useState<readonly string[]>([tabId]);
  const [active, setActive] = useState(tabId);
  const [next, setNext] = useState(2);
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);
  const [tryPaths, setTryPaths] = useState<Readonly<Record<string, string | null>>>({});
  const cancelled = useRef(false);
  const handledRuns = useRef(0);

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
    return id;
  };

  const runTry = async (): Promise<void> => {
    setTryError(null);
    const running = ids.find((id) => names[id] === MAKE_TRY && tryPaths[id] === worktreePath);
    if (running !== undefined) {
      setActive(running);
      return;
    }
    const id = add();
    setNames({ ...names, [id]: MAKE_TRY });
    setTryPaths({ ...tryPaths, [id]: worktreePath });
    try {
      await window.maple.terminal.open(tabId, id);
    } catch (err) {
      setIds((now) => now.filter((other) => other !== id));
      setNames((now) => Object.fromEntries(Object.entries(now).filter(([other]) => other !== id)));
      setActive((now) => (now === id ? tabId : now));
      setTryError(errorText(err));
      return;
    }
    window.maple.terminal.write(id, `${MAKE_TRY}\r`);
  };

  useEffect(() => {
    if (tryRuns !== handledRuns.current) {
      handledRuns.current = tryRuns;
      void runTry();
    }
  });

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
        {tryError !== null && (
          <span role="alert" className={styles.error}>
            {MAKE_TRY} did not start: {tryError}
          </span>
        )}
      </div>
      <div className={styles.views}>
        {ids.map((id) => (
          <TerminalView key={id} tabId={tabId} terminalId={id} hidden={id !== active} />
        ))}
      </div>
    </div>
  );
}
