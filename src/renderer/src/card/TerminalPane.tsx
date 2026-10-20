import { useEffect, useMemo, useRef, useState } from 'react';
import { useXterm, type XtermIo } from '../claude/useXterm';
import styles from './TerminalPane.module.css';

export function TerminalPane({ tabId }: { tabId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    const { terminal } = window.maple;
    void terminal.open(tabId);
    return terminal.onExit(tabId, setExitCode);
  }, [tabId]);

  const io = useMemo((): XtermIo => {
    const { terminal } = window.maple;
    return {
      write: (data) => {
        terminal.write(tabId, data);
      },
      resize: (cols, rows) => {
        terminal.resize(tabId, cols, rows);
      },
      backlog: () => terminal.backlog(tabId),
      onData: (cb) => terminal.onData(tabId, cb),
    };
  }, [tabId]);
  useXterm(host, io);

  const restart = () => {
    setExitCode(null);
    void window.maple.terminal.open(tabId);
  };

  return (
    <div className={styles.pane}>
      <div ref={host} className={styles.terminal} />
      {exitCode !== null && (
        <div className={styles.overlay}>
          <p>Shell exited (code {exitCode})</p>
          <button onClick={restart}>Restart</button>
        </div>
      )}
    </div>
  );
}
