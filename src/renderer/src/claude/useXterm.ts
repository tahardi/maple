import type { Unsubscribe } from '@shared/types';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, type RefObject } from 'react';

export type XtermIo = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  backlog(): Promise<string>;
  onData(cb: (data: string) => void): Unsubscribe;
  wheelLines?(): number;
};

function clipboardKeys(term: Terminal) {
  return (e: KeyboardEvent): boolean => {
    if (e.ctrlKey && e.key === '`') {
      return false;
    }
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

function loadWebgl(term: Terminal): void {
  const webgl = new WebglAddon();
  webgl.onContextLoss(() => {
    webgl.dispose();
  });
  try {
    term.loadAddon(webgl);
  } catch {
    webgl.dispose();
  }
}

function wheelReports(term: Terminal, host: HTMLElement, lines: () => number, write: (data: string) => void) {
  return (e: WheelEvent): boolean => {
    if (term.modes.mouseTrackingMode === 'none' || e.deltaY === 0) {
      return true;
    }
    const rect = host.getBoundingClientRect();
    const col = Math.min(term.cols, Math.max(1, Math.floor(((e.clientX - rect.left) / rect.width) * term.cols) + 1));
    const row = Math.min(term.rows, Math.max(1, Math.floor(((e.clientY - rect.top) / rect.height) * term.rows) + 1));
    const button = e.deltaY < 0 ? '64' : '65';
    write(`\x1b[<${button};${String(col)};${String(row)}M`.repeat(lines()));
    return false;
  };
}

export function useXterm(host: RefObject<HTMLDivElement | null>, io: XtermIo): void {
  useEffect(() => {
    const el = host.current;
    if (el === null) {
      return;
    }
    const term = new Terminal({
      fontFamily: "ui-monospace, 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace",
      fontSize: 13,
      scrollback: 10_000,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.open(el);
    loadWebgl(term);
    term.attachCustomKeyEventHandler(clipboardKeys(term));
    term.attachCustomWheelEventHandler(
      wheelReports(
        term,
        el,
        () => io.wheelLines?.() ?? 1,
        (data) => {
          io.write(data);
        },
      ),
    );
    let replaying = true;
    const typing = term.onData((data) => {
      if (!replaying) {
        io.write(data);
      }
    });
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        return;
      }
      fit.fit();
      io.resize(term.cols, term.rows);
    });
    observer.observe(el);
    let disposed = false;
    let unsubscribe: Unsubscribe | null = null;
    void io.backlog().then((backlog) => {
      if (disposed) {
        return;
      }
      term.write(backlog, () => {
        replaying = false;
      });
      unsubscribe = io.onData((data) => {
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
  }, [host, io]);
}
