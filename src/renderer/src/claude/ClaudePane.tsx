import type { TabStatus, Unsubscribe } from '@shared/types';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { useMaple } from '../store';
import { ActionBar } from './ActionBar';
import styles from './ClaudePane.module.css';
import { SessionEnded } from './SessionEnded';

export type PaneAction = { label: string; onClick: () => void; disabled?: boolean; title?: string };

type ClaudePaneProps = { tabId: string; actions: readonly PaneAction[] };

function clipboardKeys(term: Terminal) {
  return (e: KeyboardEvent): boolean => {
    if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) {
      return true;
    }
    if (e.key === 'C') {
      void navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    if (e.key === 'V') {
      void navigator.clipboard.readText().then((text) => {
        term.paste(text);
      });
      return false;
    }
    return true;
  };
}

export function ClaudePane({ tabId, actions }: ClaudePaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const status = useMaple((s): TabStatus | undefined => s.statuses[tabId]);

  useEffect(() => {
    const el = host.current;
    if (el === null) {
      return;
    }
    const { session } = window.maple;
    const term = new Terminal({
      fontFamily: "ui-monospace, 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace",
      fontSize: 13,
      scrollback: 10_000,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    term.attachCustomKeyEventHandler(clipboardKeys(term));
    const typing = term.onData((data) => {
      session.write(tabId, data);
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      session.resize(tabId, term.cols, term.rows);
    });
    observer.observe(el);
    let disposed = false;
    let unsubscribe: Unsubscribe | null = null;
    void session.backlog(tabId).then((backlog) => {
      if (disposed) {
        return;
      }
      term.write(backlog);
      unsubscribe = session.onData(tabId, (data) => {
        term.write(data);
      });
    });
    return () => {
      disposed = true;
      unsubscribe?.();
      observer.disconnect();
      typing.dispose();
      term.dispose();
    };
  }, [tabId]);

  return (
    <div className={styles.pane}>
      <ActionBar actions={actions} />
      <div className={styles.body}>
        <div ref={host} className={styles.terminal} />
        {status?.sessionAlive === false && <SessionEnded tabId={tabId} exitCode={status.exitCode} />}
      </div>
    </div>
  );
}
