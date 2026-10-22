import type { TabStatus } from '@shared/types/tabs';
import { useEffect, useMemo, useRef } from 'react';
import { useMaple } from '../store';
import { ActionBar } from './ActionBar';
import styles from './ClaudePane.module.css';
import { ScrollSpeed } from './ScrollSpeed';
import { SessionEnded } from './SessionEnded';
import { useXterm, type XtermIo } from './useXterm';
import { useWheelLines } from './useWheelLines';

export type PaneAction = { label: string; onClick: () => void; disabled?: boolean; title?: string };

type ClaudePaneProps = { tabId: string; actions: readonly PaneAction[] };

export function ClaudePane({ tabId, actions }: ClaudePaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const status = useMaple((s): TabStatus | undefined => s.statuses[tabId]);
  const [wheelLines, setWheelLines] = useWheelLines();
  const wheelLinesRef = useRef(wheelLines);

  useEffect(() => {
    wheelLinesRef.current = wheelLines;
  }, [wheelLines]);

  const io = useMemo((): XtermIo => {
    const { session } = window.maple;
    return {
      write: (data) => {
        session.write(tabId, data);
      },
      resize: (cols, rows) => {
        session.resize(tabId, cols, rows);
      },
      backlog: () => session.backlog(tabId),
      onData: (cb) => session.onData(tabId, cb),
      wheelLines: () => wheelLinesRef.current,
    };
  }, [tabId]);
  useXterm(host, io);

  return (
    <div className={styles.pane}>
      <ActionBar actions={actions}>
        <ScrollSpeed value={wheelLines} onChange={setWheelLines} />
      </ActionBar>
      <div className={styles.body}>
        <div ref={host} className={styles.terminal} />
        {status?.sessionAlive === false && (
          <SessionEnded tabId={tabId} exitCode={status.exitCode} resumeFailed={status.resumeFailed} />
        )}
      </div>
    </div>
  );
}
