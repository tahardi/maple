import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react';
import { lineMarks } from '@shared/diffMarks';
import type { DiffLines, Draft, FilePair } from '@shared/types/files';
import type { ReviewComment } from '@shared/types/github';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownText } from '@renderer/shell/MarkdownText';
import { useMaple } from '@renderer/store';
import { CommentThread } from '@renderer/card/comments/CommentThread';
import { linesLabel, selectedLines, type Lines } from './selectedLines';
import { toThreads } from '@renderer/card/comments/commentThreads';
import { toDecorations } from './inFileDecorations';
import { LineComment } from '@renderer/card/comments/LineComment';
import './monacoSetup';
import { PR_DESCRIPTION } from '@renderer/card/prDescription';
import { CARD_DESCRIPTION } from '@renderer/card/cardDescription';
import { useLineZones } from '@renderer/card/comments/useLineZones';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import styles from './viewer.module.css';

type Props = {
  tabId: string;
  openFiles: readonly string[];
  activeFile: string | null;
  onActivate: (path: string) => void;
  onCloseFile: (path: string) => void;
  prBody: string | null;
  cardBody?: string;
  line: number | null;
  canComment: boolean;
  prFetchedAt: string | null;
  onComments?: (comments: readonly ReviewComment[]) => void;
};

type Mode = 'in-file' | 'side-by-side';

const MODE_KEY = 'maple.viewMode';

const NO_DRAFTS: Record<string, Draft> = {};

const NO_COMMENTS: ReviewComment[] = [];

const NO_DIFF: DiffLines = { ranges: {}, unpushed: [] };

const OUTSIDE_DIFF = 'GitHub only accepts comments on lines in the PR diff';

const NOT_PUSHED = 'Push your edits first: line numbers would not match the PR';

const OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: true, renderCharacters: false, size: 'fit', showSlider: 'always' },
} as const;

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
  if (path === CARD_DESCRIPTION) {
    return 'Card description';
  }
  const bare = path.startsWith(VAULT_PREFIX) ? path.slice(VAULT_PREFIX.length) : path;
  return bare.split('/').at(-1) ?? bare;
}

export function FileViewer({
  tabId,
  openFiles,
  activeFile,
  onActivate,
  onCloseFile,
  prBody,
  cardBody,
  line,
  canComment,
  prFetchedAt,
  onComments,
}: Props) {
  const monaco = useMonaco();
  const [mode, setMode] = useState(loadMode);
  const [pair, setPair] = useState<FilePair | null>(null);
  const [note, setNote] = useState<{ path: string; text: string } | null>(null);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const scrollTarget = useRef<editor.ICodeEditor | null>(null);
  const [target, setTarget] = useState<editor.ICodeEditor | null>(null);
  const keepScroll = useRef<number | null>(null);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const setDraft = useMaple((s) => s.setDraft);
  const dot = useMaple((s) => (tabId in s.statuses ? s.statuses[tabId].dot : null));
  const [saveError, setSaveError] = useState<{ path: string; message: string } | null>(null);
  const pendingLine = useRef<number | null>(null);
  const [commenting, setCommenting] = useState<({ path: string } & Lines) | null>(null);
  const [refused, setRefused] = useState<({ path: string } & Lines) | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>(NO_COMMENTS);
  const [commentsRead, setCommentsRead] = useState(0);
  const [diff, setDiff] = useState<DiffLines>(NO_DIFF);
  const [picked, setPicked] = useState<{ editor: editor.ICodeEditor; lines: Lines } | null>(null);

  const showsDescription = activeFile === PR_DESCRIPTION || activeFile === CARD_DESCRIPTION;
  const showsNote = activeFile?.startsWith(VAULT_PREFIX) ?? false;
  const markdown =
    activeFile === PR_DESCRIPTION
      ? (prBody ?? '')
      : activeFile === CARD_DESCRIPTION
        ? (cardBody ?? '')
        : note !== null && note.path === activeFile
          ? note.text
          : null;

  const shownNote = showsNote && note !== null && note.path === activeFile ? note : null;
  const noteDraft = shownNote !== null && Object.hasOwn(drafts, shownNote.path) ? drafts[shownNote.path] : null;
  const editsNote = shownNote !== null && (editing[shownNote.path] ?? noteDraft !== null);

  useEffect(() => {
    if (activeFile === null || !activeFile.startsWith(VAULT_PREFIX)) {
      return;
    }
    let live = true;
    const load = () => {
      void window.maple.vault.read(activeFile.slice(VAULT_PREFIX.length)).then((text) => {
        if (live) {
          setNote({ path: activeFile, text });
        }
      });
    };
    load();
    const unsubscribe = window.maple.vault.onChanged(load);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [activeFile]);

  useEffect(() => {
    if (
      activeFile === null ||
      activeFile === PR_DESCRIPTION ||
      activeFile === CARD_DESCRIPTION ||
      activeFile.startsWith(VAULT_PREFIX)
    ) {
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
  const commentable = canComment && text !== null && text.current !== null && !sideBySide && plain !== null;
  const ranges = text !== null && Object.hasOwn(diff.ranges, text.path) ? diff.ranges[text.path] : [];
  const shownSelection = plain?.getSelection() ?? null;
  const selected =
    picked !== null && picked.editor === plain
      ? picked.lines
      : shownSelection === null
        ? null
        : selectedLines(shownSelection);
  const inDiff = selected !== null && ranges.some(([start, end]) => start <= selected.start && selected.end <= end);
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
          minimap: { color: spec.overviewColor, position: monaco.editor.MinimapPosition.Gutter },
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
          onComments?.(next);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, canComment, commentsRead, prFetchedAt, dot, onComments]);

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
    const subscription = plain.onDidChangeCursorSelection((e) => {
      setPicked({ editor: plain, lines: selectedLines(e.selection) });
    });
    return () => {
      subscription.dispose();
    };
  }, [plain]);

  const threads = useMemo(
    () => (text === null || !canComment ? [] : toThreads(comments, text.path)),
    [comments, text, canComment],
  );

  const zones = useLineZones(plain, threads);

  const textPath = text?.path ?? null;

  const formItems = useMemo(
    () =>
      commentable && commenting !== null && commenting.path === textPath ? [{ id: 'new', line: commenting.end }] : [],
    [commentable, commenting, textPath],
  );

  const forms = useLineZones(plain, formItems);

  useEffect(() => {
    const node = forms.at(0)?.node;
    if (node === undefined) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (node.offsetHeight > 0) {
        observer.disconnect();
        node.querySelector('textarea')?.focus();
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [forms]);

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

  const keepEditing = (path: string) => {
    setEditing((now) => ({ ...now, [path]: true }));
  };

  const editNote = (value: string | undefined) => {
    if (shownNote === null) {
      return;
    }
    keepEditing(shownNote.path);
    const next = value ?? '';
    setDraft(tabId, shownNote.path, next === shownNote.text ? null : { text: next, disk: shownNote.text });
  };

  const isSave = (e: KeyboardEvent) => {
    if (!e.ctrlKey || e.key.toLowerCase() !== 's') {
      return false;
    }
    e.preventDefault();
    return true;
  };

  const persist = (path: string, write: Promise<void>, saved: () => void) => {
    setSaveError(null);
    write.then(
      () => {
        saved();
        setDraft(tabId, path, null);
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setSaveError({
          path,
          message: message.replace(/^Error invoking remote method '[^']+': Error: /, ''),
        });
      },
    );
  };

  const save = (e: KeyboardEvent) => {
    if (!isSave(e) || text === null || draft === null) {
      return;
    }
    persist(text.path, window.maple.repo.writeFile(tabId, text.path, draft.text), () => {
      setPair({ ...text, current: draft.text });
    });
  };

  const saveNote = (e: KeyboardEvent) => {
    if (!isSave(e) || shownNote === null || noteDraft === null) {
      return;
    }
    persist(shownNote.path, window.maple.vault.write(shownNote.path.slice(VAULT_PREFIX.length), noteDraft.text), () => {
      setNote({ ...shownNote, text: noteDraft.text });
      keepEditing(shownNote.path);
    });
  };

  const label = (path: string) => (Object.hasOwn(drafts, path) ? `● ${baseName(path)}` : baseName(path));

  const choose = (next: Mode) => {
    setMode(next);
    saveMode(next);
  };

  const notices = (path: string, mine: Draft | null, disk: string | null) => (
    <>
      {saveError?.path === path && (
        <div className={styles.notice} role="alert">
          {`Saving failed: ${saveError.message}`}
        </div>
      )}
      {mine !== null && mine.disk !== disk && (
        <div className={styles.notice}>
          File changed on disk
          <button
            onClick={() => {
              if (path.startsWith(VAULT_PREFIX)) {
                keepEditing(path);
              }
              setDraft(tabId, path, null);
            }}
          >
            Reload
          </button>
          <button
            onClick={() => {
              setDraft(tabId, path, { text: mine.text, disk });
            }}
          >
            Keep mine
          </button>
        </div>
      )}
    </>
  );

  const body = () => {
    if (editsNote) {
      return (
        <>
          {notices(shownNote.path, noteDraft, shownNote.text)}
          <div className={styles.editor} onKeyDown={saveNote}>
            <Editor
              value={noteDraft?.text ?? shownNote.text}
              language="markdown"
              theme="vs-dark"
              height="100%"
              options={{ ...OPTIONS, readOnly: false, domReadOnly: false }}
              onChange={editNote}
              onMount={setPlain}
            />
          </div>
        </>
      );
    }
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
        {notices(shown.path, draft, shown.current)}
        {commentable &&
          blocked !== null &&
          refused?.path === shown.path &&
          refused.start === selected?.start &&
          refused.end === selected.end && (
            <div className={styles.notice} role="alert">
              {`Can't comment on ${linesLabel(refused)}. ${blocked}`}
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
                aria-label={`Close ${path === PR_DESCRIPTION || path === CARD_DESCRIPTION ? baseName(path) : path}`}
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
        {shownNote !== null && (
          <div className={styles.toggle}>
            <button
              onClick={() => {
                setEditing({ ...editing, [shownNote.path]: !editsNote });
              }}
            >
              {editsNote ? 'Preview' : 'Edit'}
            </button>
          </div>
        )}
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
                title={blocked ?? undefined}
                onClick={() => {
                  if (selected === null) {
                    return;
                  }
                  if (blocked === null) {
                    setRefused(null);
                    setCommenting({ path: text.path, ...selected });
                  } else {
                    setRefused({ path: text.path, ...selected });
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
      {zones.map(({ item, node }) =>
        createPortal(
          <CommentThread
            tabId={tabId}
            thread={item}
            onPosted={() => {
              setCommentsRead((n) => n + 1);
            }}
          />,
          node,
          item.id,
        ),
      )}
      {commenting !== null &&
        forms.map(({ node }) =>
          createPortal(
            <LineComment
              tabId={tabId}
              path={commenting.path}
              startLine={commenting.start === commenting.end ? null : commenting.start}
              line={commenting.end}
              onDone={() => {
                setCommenting(null);
                setCommentsRead((n) => n + 1);
              }}
            />,
            node,
            'new',
          ),
        )}
    </div>
  );
}
