import { useEffect, useMemo, useRef, useState } from 'react';
import { useXterm, type XtermIo } from '../claude/useXterm';
import styles from './TerminalPane.module.css';

type Props = { tabId: string; terminalId: string; hidden?: boolean };

export function TerminalView({ tabId, terminalId, hidden }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    const { terminal } = window.maple;
    void terminal.open(tabId, terminalId);
    return terminal.onExit(terminalId, setExitCode);
  }, [tabId, terminalId]);

  const io = useMemo((): XtermIo => {
    const { terminal } = window.maple;
    return {
      write: (data) => {
        terminal.write(terminalId, data);
      },
      resize: (cols, rows) => {
        terminal.resize(terminalId, cols, rows);
      },
      backlog: () => terminal.backlog(terminalId),
      onData: (cb) => terminal.onData(terminalId, cb),
    };
  }, [terminalId]);
  useXterm(host, io);

  const restart = () => {
    setExitCode(null);
    void window.maple.terminal.open(tabId, terminalId);
  };

  return (
    <div className={styles.view} hidden={hidden}>
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
