import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react';
import { lineMarks } from '@shared/diffMarks';
import type { Draft, FilePair } from '@shared/types';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MarkdownText } from '../shell/MarkdownText';
import { useMaple } from '../store';
import { toDecorations } from './inFileDecorations';
import './monacoSetup';
import { PR_DESCRIPTION } from './prDescription';
import styles from './viewer.module.css';

type Props = {
  tabId: string;
  openFiles: readonly string[];
  activeFile: string | null;
  onActivate: (path: string) => void;
  onCloseFile: (path: string) => void;
  prBody: string | null;
};

type Mode = 'in-file' | 'side-by-side';

const MODE_KEY = 'maple.viewMode';

const NO_DRAFTS: Record<string, Draft> = {};

const OPTIONS = { readOnly: true, domReadOnly: true, minimap: { enabled: false } };

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'side-by-side' ? 'side-by-side' : 'in-file';
  } catch {
    return 'in-file';
  }
}

function saveMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    return;
  }
}

function baseName(path: string): string {
  if (path === PR_DESCRIPTION) {
    return 'PR description';
  }
  return path.split('/').at(-1) ?? path;
}

export function FileViewer({ tabId, openFiles, activeFile, onActivate, onCloseFile, prBody }: Props) {
  const monaco = useMonaco();
  const [mode, setMode] = useState(loadMode);
  const [pair, setPair] = useState<FilePair | null>(null);
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const scrollTarget = useRef<editor.ICodeEditor | null>(null);
  const keepScroll = useRef<number | null>(null);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const setDraft = useMaple((s) => s.setDraft);

  const showsDescription = activeFile === PR_DESCRIPTION;

  useEffect(() => {
    if (activeFile === null || activeFile === PR_DESCRIPTION) {
      return;
    }
    let live = true;
    const load = (keep: boolean) => {
      const top = keep ? (scrollTarget.current?.getScrollTop() ?? null) : null;
      void window.maple.repo.readFile(tabId, activeFile).then((next) => {
        if (live) {
          keepScroll.current = top;
          setPair(next);
        }
      });
    };
    load(false);
    const unsubscribe = window.maple.repo.onChanged(tabId, () => {
      load(true);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [tabId, activeFile]);

  useEffect(() => {
    if (keepScroll.current !== null) {
      scrollTarget.current?.setScrollTop(keepScroll.current);
      keepScroll.current = null;
    }
  }, [pair]);

  const shown = pair !== null && pair.path === activeFile ? pair : null;
  const text = shown?.kind === 'text' ? shown : null;
  const changed = text !== null && text.current !== null && text.base !== text.current;
  const sideBySide = changed && mode === 'side-by-side';
  const draft = text === null ? null : Object.hasOwn(drafts, text.path) ? drafts[text.path] : null;
  const edited = draft?.text ?? text?.current ?? null;
  const stale = text !== null && draft !== null && draft.disk !== text.current;

  const specs = useMemo(
    () => (text !== null && edited !== null && text.base !== edited ? toDecorations(lineMarks(text.base, edited)) : []),
    [text, edited],
  );

  useEffect(() => {
    if (plain === null || monaco === null) {
      return;
    }
    const decorations = plain.createDecorationsCollection(
      specs.map((spec) => ({
        range: { startLineNumber: spec.startLine, startColumn: 1, endLineNumber: spec.endLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: spec.className,
          marginClassName: spec.marginClassName,
          overviewRuler: { color: spec.overviewColor, position: monaco.editor.OverviewRulerLane.Full },
          hoverMessage: spec.hover === null ? null : { value: spec.hover },
        },
      })),
    );
    return () => {
      decorations.clear();
    };
  }, [plain, monaco, specs]);

  const language = useMemo(() => {
    if (activeFile === null || monaco === null) {
      return undefined;
    }
    const name = baseName(activeFile);
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : null;
    return monaco.languages
      .getLanguages()
      .find((l) => (ext !== null && l.extensions?.includes(ext)) || l.filenames?.includes(name))?.id;
  }, [activeFile, monaco]);

  const edit = (value: string | undefined) => {
    if (text === null) {
      return;
    }
    const next = value ?? '';
    setDraft(tabId, text.path, next === text.current ? null : { text: next, disk: text.current });
  };

  const save = (e: KeyboardEvent) => {
    if (!e.ctrlKey || e.key.toLowerCase() !== 's') {
      return;
    }
    e.preventDefault();
    if (text === null || draft === null) {
      return;
    }
    void window.maple.repo.writeFile(tabId, text.path, draft.text).then(() => {
      setPair({ ...text, current: draft.text });
      setDraft(tabId, text.path, null);
    });
  };

  const label = (path: string) => (Object.hasOwn(drafts, path) ? `● ${baseName(path)}` : baseName(path));

  const choose = (next: Mode) => {
    setMode(next);
    saveMode(next);
  };

  const body = () => {
    if (showsDescription) {
      return (
        <div className={styles.description}>
          <MarkdownText text={prBody ?? ''} />
        </div>
      );
    }
    if (shown === null) {
      return null;
    }
    if (shown.kind === 'binary') {
      return <div className={styles.message}>Binary file, not shown</div>;
    }
    if (shown.kind === 'tooLarge') {
      return (
        <div className={styles.message}>{`File too large to show (${(shown.bytes / 1024 / 1024).toFixed(1)} MB)`}</div>
      );
    }
    if (sideBySide) {
      return (
        <DiffEditor
          original={shown.base ?? ''}
          modified={shown.current ?? ''}
          language={language}
          theme="vs-dark"
          height="100%"
          options={{ ...OPTIONS, renderSideBySide: true, originalEditable: false }}
          onMount={(diff) => {
            setPlain(null);
            scrollTarget.current = diff.getModifiedEditor();
          }}
        />
      );
    }
    return (
      <>
        {shown.current === null && <div className={styles.notice}>Deleted in this branch</div>}
        {stale && (
          <div className={styles.notice}>
            File changed on disk
            <button
              onClick={() => {
                setDraft(tabId, shown.path, null);
              }}
            >
              Reload
            </button>
            <button
              onClick={() => {
                setDraft(tabId, shown.path, { text: draft.text, disk: shown.current });
              }}
            >
              Keep mine
            </button>
          </div>
        )}
        <div className={styles.editor} onKeyDown={save}>
          <Editor
            value={edited ?? shown.base ?? ''}
            language={language}
            theme="vs-dark"
            height="100%"
            options={{ ...OPTIONS, readOnly: shown.current === null, domReadOnly: shown.current === null }}
            onChange={edit}
            onMount={(mounted) => {
              setPlain(mounted);
              scrollTarget.current = mounted;
            }}
          />
        </div>
      </>
    );
  };

  return (
    <div className={styles.viewer}>
      <div className={styles.bar}>
        <div className={styles.tabs} role="tablist">
          {openFiles.map((path) => (
            <div
              key={path}
              role="tab"
              aria-label={label(path)}
              aria-selected={path === activeFile}
              title={path}
              className={path === activeFile ? `${styles.tab} ${styles.active}` : styles.tab}
              onClick={() => {
                onActivate(path);
              }}
            >
              {label(path)}
              <button
                aria-label={`Close ${path === PR_DESCRIPTION ? baseName(path) : path}`}
                className={styles.close}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(path);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {!showsDescription && (
          <div className={styles.toggle}>
            <button
              aria-pressed={mode === 'in-file'}
              onClick={() => {
                choose('in-file');
              }}
            >
              In file
            </button>
            <button
              aria-pressed={mode === 'side-by-side'}
              onClick={() => {
                choose('side-by-side');
              }}
            >
              Side by side
            </button>
          </div>
        )}
      </div>
      <div className={styles.body}>{body()}</div>
    </div>
  );
}
