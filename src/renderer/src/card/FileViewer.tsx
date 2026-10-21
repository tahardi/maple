import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react';
import { lineMarks } from '@shared/diffMarks';
import type { DiffLines, Draft, FilePair, ReviewComment } from '@shared/types';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MarkdownText } from '../shell/MarkdownText';
import { useMaple } from '../store';
import { toCommentMarks } from './commentMarks';
import { toDecorations } from './inFileDecorations';
import { LineComment } from './LineComment';
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
  canComment: boolean;
};

type Mode = 'in-file' | 'side-by-side';

const MODE_KEY = 'maple.viewMode';

const NO_DRAFTS: Record<string, Draft> = {};

const NO_COMMENTS: ReviewComment[] = [];

const NO_DIFF: DiffLines = { ranges: {}, unpushed: [] };

const OUTSIDE_DIFF = 'GitHub only accepts comments on lines in the PR diff';

const NOT_PUSHED = 'Push your edits first: line numbers would not match the PR';

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

export function FileViewer({ tabId, openFiles, activeFile, onActivate, onCloseFile, prBody, line, canComment }: Props) {
  const monaco = useMonaco();
  const [mode, setMode] = useState(loadMode);
  const [pair, setPair] = useState<FilePair | null>(null);
  const [note, setNote] = useState<{ path: string; text: string } | null>(null);
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const scrollTarget = useRef<editor.ICodeEditor | null>(null);
  const [target, setTarget] = useState<editor.ICodeEditor | null>(null);
  const keepScroll = useRef<number | null>(null);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const setDraft = useMaple((s) => s.setDraft);
  const [saveError, setSaveError] = useState<{ path: string; message: string } | null>(null);
  const pendingLine = useRef<number | null>(null);
  const [commenting, setCommenting] = useState<{ path: string; line: number } | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>(NO_COMMENTS);
  const [commentsRead, setCommentsRead] = useState(0);
  const [diff, setDiff] = useState<DiffLines>(NO_DIFF);
  const [cursor, setCursor] = useState<{ editor: editor.ICodeEditor; line: number } | null>(null);

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
    const at = pendingLine.current;
    const model = target?.getModel() ?? null;
    if (at === null || shown?.kind !== 'text' || target === null || model === null) {
      return;
    }
    target.revealLineInCenter(at);
    target.setSelection({
      startLineNumber: at,
      startColumn: 1,
      endLineNumber: at,
      endColumn: model.getLineMaxColumn(at),
    });
    target.focus();
    pendingLine.current = null;
  }, [line, shown, target]);

  const text = shown?.kind === 'text' ? shown : null;
  const changed = text !== null && text.current !== null && text.base !== text.current;
  const sideBySide = changed && mode === 'side-by-side';
  const draft = text === null ? null : Object.hasOwn(drafts, text.path) ? drafts[text.path] : null;
  const edited = draft?.text ?? text?.current ?? null;
  const stale = text !== null && draft !== null && draft.disk !== text.current;
  const commentable = canComment && text !== null && text.current !== null && !sideBySide && plain !== null;
  const ranges = text !== null && Object.hasOwn(diff.ranges, text.path) ? diff.ranges[text.path] : [];
  const cursorLine = cursor !== null && cursor.editor === plain ? cursor.line : plain?.getPosition()?.lineNumber;
  const inDiff = cursorLine !== undefined && ranges.some(([start, end]) => start <= cursorLine && cursorLine <= end);
  const blocked = text !== null && diff.unpushed.includes(text.path) ? NOT_PUSHED : inDiff ? null : OUTSIDE_DIFF;

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

  useEffect(() => {
    if (!canComment) {
      return;
    }
    let live = true;
    window.maple.pr.comments(tabId).then(
      (next) => {
        if (live) {
          setComments(next);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, canComment, commentsRead]);

  useEffect(() => {
    if (!canComment) {
      return;
    }
    let live = true;
    window.maple.pr.diffLines(tabId).then(
      (next) => {
        if (live) {
          setDiff(next);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, canComment, commentsRead, activeFile]);

  useEffect(() => {
    if (plain === null) {
      return;
    }
    const subscription = plain.onDidChangeCursorPosition((e) => {
      setCursor({ editor: plain, line: e.position.lineNumber });
    });
    return () => {
      subscription.dispose();
    };
  }, [plain]);

  const commentMarks = useMemo(
    () => (text === null || !canComment ? [] : toCommentMarks(comments, text.path)),
    [comments, text, canComment],
  );

  useEffect(() => {
    const model = plain?.getModel() ?? null;
    if (plain === null || model === null || commentMarks.length === 0) {
      return;
    }
    const decorations = plain.createDecorationsCollection(
      commentMarks.map((mark) => ({
        range: {
          startLineNumber: mark.line,
          startColumn: 1,
          endLineNumber: mark.line,
          endColumn: model.getLineMaxColumn(mark.line),
        },
        options: {
          isWholeLine: true,
          showIfCollapsed: true,
          linesDecorationsClassName: 'margin-comment',
          after: { content: mark.preview, inlineClassName: 'comment-preview' },
          hoverMessage: { value: mark.hover },
        },
      })),
    );
    return () => {
      decorations.clear();
    };
  }, [plain, commentMarks]);

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
    setSaveError(null);
    window.maple.repo.writeFile(tabId, text.path, draft.text).then(
      () => {
        setPair({ ...text, current: draft.text });
        setDraft(tabId, text.path, null);
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setSaveError({
          path: text.path,
          message: message.replace(/^Error invoking remote method '[^']+': Error: /, ''),
        });
      },
    );
  };

  const label = (path: string) => (Object.hasOwn(drafts, path) ? `● ${baseName(path)}` : baseName(path));

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
            setTarget(diff.getModifiedEditor());
          }}
        />
      );
    }
    return (
      <>
        {shown.current === null && <div className={styles.notice}>Deleted in this branch</div>}
        {saveError?.path === shown.path && (
          <div className={styles.notice} role="alert">
            {`Saving failed: ${saveError.message}`}
          </div>
        )}
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
        {commentable && commenting?.path === shown.path && (
          <LineComment
            tabId={tabId}
            path={commenting.path}
            line={commenting.line}
            onDone={() => {
              setCommenting(null);
              setCommentsRead((n) => n + 1);
            }}
          />
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
              setTarget(mounted);
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
            {commentable && (
              <button
                disabled={blocked !== null}
                title={blocked ?? undefined}
                onClick={() => {
                  const at = plain.getPosition()?.lineNumber;
                  if (at !== undefined) {
                    setCommenting({ path: text.path, line: at });
                  }
                }}
              >
                Comment
              </button>
            )}
          </div>
        )}
      </div>
      <div className={styles.body}>{body()}</div>
    </div>
  );
}
