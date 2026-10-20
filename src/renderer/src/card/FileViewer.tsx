import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react';
import { lineMarks } from '@shared/diffMarks';
import type { FilePair } from '@shared/types';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownText } from '../shell/MarkdownText';
import { toDecorations } from './inFileDecorations';
import './monacoSetup';
import { PR_DESCRIPTION } from './prDescription';
import { VAULT_PREFIX } from './VaultSwitch';
import styles from './viewer.module.css';

type Props = {
  tabId: string;
  openFiles: readonly string[];
  activeFile: string | null;
  onActivate: (path: string) => void;
  onCloseFile: (path: string) => void;
  prBody: string | null;
  line: number | null;
};

type Mode = 'in-file' | 'side-by-side';

const MODE_KEY = 'maple.viewMode';

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
  const bare = path.startsWith(VAULT_PREFIX) ? path.slice(VAULT_PREFIX.length) : path;
  return bare.split('/').at(-1) ?? bare;
}

export function FileViewer({ tabId, openFiles, activeFile, onActivate, onCloseFile, prBody, line }: Props) {
  const monaco = useMonaco();
  const [mode, setMode] = useState(loadMode);
  const [pair, setPair] = useState<FilePair | null>(null);
  const [note, setNote] = useState<{ path: string; text: string } | null>(null);
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const scrollTarget = useRef<editor.ICodeEditor | null>(null);
  const keepScroll = useRef<number | null>(null);
  const pendingLine = useRef<number | null>(null);

  const showsDescription = activeFile === PR_DESCRIPTION;
  const showsNote = activeFile?.startsWith(VAULT_PREFIX) ?? false;
  const markdown = showsDescription ? (prBody ?? '') : note !== null && note.path === activeFile ? note.text : null;

  useEffect(() => {
    if (activeFile === null || !activeFile.startsWith(VAULT_PREFIX)) {
      return;
    }
    let live = true;
    void window.maple.vault.read(activeFile.slice(VAULT_PREFIX.length)).then((text) => {
      if (live) {
        setNote({ path: activeFile, text });
      }
    });
    return () => {
      live = false;
    };
  }, [activeFile]);

  useEffect(() => {
    if (activeFile === null || activeFile === PR_DESCRIPTION || activeFile.startsWith(VAULT_PREFIX)) {
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

  useEffect(() => {
    pendingLine.current = line;
  }, [line, activeFile]);

  useEffect(() => {
    const target = scrollTarget.current;
    if (pendingLine.current === null || shown?.kind !== 'text' || target === null) {
      return;
    }
    target.revealLineInCenter(pendingLine.current);
    target.setPosition({ lineNumber: pendingLine.current, column: 1 });
    pendingLine.current = null;
  }, [line, shown, plain]);
  const text = shown?.kind === 'text' ? shown : null;
  const changed = text !== null && text.current !== null && text.base !== text.current;
  const sideBySide = changed && mode === 'side-by-side';

  const specs = useMemo(
    () => (text !== null && text.current !== null && changed ? toDecorations(lineMarks(text.base, text.current)) : []),
    [text, changed],
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

  const choose = (next: Mode) => {
    setMode(next);
    saveMode(next);
  };

  const body = () => {
    if (showsDescription || showsNote) {
      return (
        markdown !== null && (
          <div className={styles.description}>
            <MarkdownText text={markdown} />
          </div>
        )
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
        <div className={styles.editor}>
          <Editor
            value={shown.current ?? shown.base ?? ''}
            language={language}
            theme="vs-dark"
            height="100%"
            options={OPTIONS}
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
              aria-label={baseName(path)}
              aria-selected={path === activeFile}
              title={path}
              className={path === activeFile ? `${styles.tab} ${styles.active}` : styles.tab}
              onClick={() => {
                onActivate(path);
              }}
            >
              {baseName(path)}
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
        {!showsDescription && !showsNote && (
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
