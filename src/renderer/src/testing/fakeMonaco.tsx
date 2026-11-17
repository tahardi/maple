import { useEffect, useRef, useState } from 'react';
import { vi } from 'vitest';

type Selection = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };

const collection = { clear: vi.fn() };

const zones = {
  addZone: vi.fn<
    (zone: { afterLineNumber: number; domNode: HTMLElement; heightInPx: number; suppressMouseDown?: boolean }) => string
  >(() => 'z1'),
  removeZone: vi.fn(),
  layoutZone: vi.fn(),
};

const cursor: { value: (e: { selection: Selection }) => void } = { value: () => undefined };

const model = { getLineMaxColumn: () => 9 };

const editor = {
  changeViewZones: vi.fn((cb: (accessor: typeof zones) => void) => {
    cb(zones);
  }),
  createDecorationsCollection: vi.fn(() => collection),
  getScrollTop: vi.fn(() => 120),
  setScrollTop: vi.fn(),
  revealLineInCenter: vi.fn(),
  setSelection: vi.fn(),
  focus: vi.fn(),
  getModel: vi.fn(() => model),
  getSelection: vi.fn(() => ({ startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 })),
  onDidChangeCursorSelection: vi.fn((cb: (e: { selection: Selection }) => void) => {
    cursor.value = cb;
    return { dispose: vi.fn() };
  }),
};

const api = {
  editor: { OverviewRulerLane: { Full: 7 }, MinimapPosition: { Gutter: 2 } },
  languages: {
    getLanguages: () => [
      { id: 'typescript', extensions: ['.ts'] },
      { id: 'makefile', filenames: ['Makefile'] },
    ],
  },
};

const change: { value: (text: string, isFlush?: boolean) => void } = { value: () => undefined };

export const monaco = {
  editor,
  zones,
  collection,
  api,
  change,
  cursor,
  enabled: { value: false },
  slowMount: { value: false },
};

export function useMonaco() {
  return monaco.enabled.value ? monaco.api : null;
}

export function Editor(props: {
  value: string;
  language: string | undefined;
  options: { readOnly: boolean; minimap?: { enabled: boolean; size: string }; wordWrap?: string };
  onMount: (editor: unknown) => void;
  onChange: (value: string | undefined, change: { isFlush: boolean }) => void;
}) {
  const { onMount, onChange } = props;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    monaco.change.value = (text, isFlush = false) => {
      onChange(text, { isFlush });
    };
  }, [onChange]);
  const instance = useRef({
    ...monaco.editor,
    disposed: false,
    getModel() {
      return this.disposed ? null : monaco.editor.getModel();
    },
  });
  useEffect(() => {
    const mounted = instance.current;
    if (!monaco.slowMount.value) {
      onMount(mounted);
      let live = true;
      void Promise.resolve().then(() => {
        if (live) {
          setReady(true);
        }
      });
      return () => {
        live = false;
      };
    }
    const timer = setTimeout(() => {
      onMount(mounted);
      setReady(true);
    }, 10);
    return () => {
      clearTimeout(timer);
    };
  }, [onMount]);
  useEffect(() => {
    const mounted = instance.current;
    return () => {
      mounted.disposed = true;
    };
  }, []);
  return (
    <div
      data-testid="editor"
      data-mounted={String(ready)}
      data-value={props.value}
      data-language={props.language}
      data-readonly={String(props.options.readOnly)}
      data-minimap={JSON.stringify(props.options.minimap)}
      data-wrap={props.options.wordWrap}
    />
  );
}

export function DiffEditor(props: {
  original: string;
  modified: string;
  options: {
    renderSideBySide: boolean;
    readOnly: boolean;
    minimap?: { enabled: boolean; size: string };
    wordWrap?: string;
  };
  onMount: (editor: unknown) => void;
}) {
  const { onMount } = props;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    onMount({ getModifiedEditor: () => monaco.editor });
    let live = true;
    void Promise.resolve().then(() => {
      if (live) {
        setReady(true);
      }
    });
    return () => {
      live = false;
    };
  }, [onMount]);
  return (
    <div
      data-testid="diff-editor"
      data-mounted={String(ready)}
      data-original={props.original}
      data-modified={props.modified}
      data-side-by-side={String(props.options.renderSideBySide)}
      data-readonly={String(props.options.readOnly)}
      data-minimap={JSON.stringify(props.options.minimap)}
      data-wrap={props.options.wordWrap}
    />
  );
}
