import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react';
import { lineMarks } from '@shared/diff/diffMarks';
import type { DiffLines } from '@shared/types/files/diffLines';
import type { Draft } from '@shared/types/files/draft';
import type { FilePair } from '@shared/types/files/filePair';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import type { editor, IRange } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { useMaple } from '@renderer/store';
import { CommentThread } from '@renderer/card/comments/CommentThread';
import { linesLabel, selectedLines, type Lines } from '@renderer/card/viewer/editor/selectedLines';
import { toThreads } from '@renderer/card/comments/commentThreads';
import { toDecorations } from '@renderer/card/viewer/editor/inFileDecorations';
import { LineComment } from '@renderer/card/comments/LineComment';
import '@renderer/card/viewer/editor/monacoSetup';
import { PR_DESCRIPTION } from '@renderer/card/viewer/tabs/prDescription';
import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';
import { useLineZones } from '@renderer/card/comments/useLineZones';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { NoteOverview } from './overview/NoteOverview';
import { FileTabMenu } from '@renderer/card/viewer/tabs/FileTabMenu';
import styles from './FileViewer.module.css';
import { errorText } from '@shared/errors/errorText';

type Props = {
  tabId: string;
  openFiles: readonly string[];
  activeFile: string | null;
  onActivate: (path: string) => void;
  onCloseFiles: (paths: readonly string[]) => void;
  prBody: string | null;
  cardBody?: string;
  line: number | null;
  canComment: boolean;
  prFetchedAt: string | null;
  noteChanges?: boolean;
  onComments?: (comments: readonly ReviewComment[]) => void;
  review?: Review | null;
  preview?: string | null;
  onPin?: (path: string) => void;
};

type Mode = 'in-file' | 'side-by-side';

const MODE_KEY = 'maple.viewMode';

const WRAP_KEY = 'maple.noteWrap';

const NO_DRAFTS: Record<string, Draft> = {};

const NO_COMMENTS: ReviewComment[] = [];

const OUTSIDE_DIFF = 'GitHub only accepts comments on lines in the PR diff';

const NO_REVIEW = 'Review not loaded: click Reload review to pin comments to the reviewed commit';

const NO_COPY = 'No saved copy of this note from this session';

const NO_SELECTION = 'Select lines to comment on';

const LEAVE_EDIT = 'Turn off Edit to see changes';

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

function loadWrap(): boolean {
  try {
    return localStorage.getItem(WRAP_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveWrap(wrap: boolean) {
  try {
    localStorage.setItem(WRAP_KEY, wrap ? 'on' : 'off');
  } catch {
    return;
  }
}

function isChanged(pair: FilePair | null): boolean {
  return pair?.kind === 'text' && pair.current !== null && pair.base !== pair.current;
}

function atFileStart(range: IRange): boolean {
  return range.startLineNumber === 1 && range.startColumn === 1 && range.endLineNumber === 1 && range.endColumn === 1;
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
  onCloseFiles,
  prBody,
  cardBody,
  line,
  canComment,
  prFetchedAt,
  noteChanges = false,
  onComments,
  review = null,
  preview = null,
  onPin,
}: Props) {
  const monaco = useMonaco();
  const [mode, setMode] = useState(loadMode);
  const [wrap, setWrap] = useState(loadWrap);
  const [pair, setPair] = useState<FilePair | null>(null);
  const [readError, setReadError] = useState<{ path: string; message: string } | null>(null);
  const [note, setNote] = useState<{ path: string; text: string } | null>(null);
  const [noteScroller, setNoteScroller] = useState<HTMLDivElement | null>(null);
  const [before, setBefore] = useState<{ path: string; text: string | null; error: string | null } | null>(null);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const scrollTarget = useRef<editor.ICodeEditor | null>(null);
  const [target, setTarget] = useState<editor.ICodeEditor | null>(null);
  const keepScroll = useRef<number | null>(null);
  const loadedFile = useRef<string | null>(null);
  const active = useMaple((s) => s.activeTabId === tabId);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const setDraft = useMaple((s) => s.setDraft);
  const dot = useMaple((s) => (tabId in s.statuses ? s.statuses[tabId].dot : null));
  const [saveError, setSaveError] = useState<{ path: string; message: string } | null>(null);
  const pendingLine = useRef<number | null>(null);
  const [commenting, setCommenting] = useState<({ path: string } & Lines) | null>(null);
  const [refused, setRefused] = useState<({ path: string } & Lines) | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>(NO_COMMENTS);
  const [commentsRead, setCommentsRead] = useState(0);
  const [diff, setDiff] = useState<({ headSha: string } & DiffLines) | null>(null);
  const [picked, setPicked] = useState<{ editor: editor.ICodeEditor; lines: Lines | null } | null>(null);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);

  const wordWrap = wrap ? 'on' : 'off';
  const headSha = review?.headSha ?? null;
  const baseSha = review?.baseSha ?? null;
  const watching = active || (headSha !== null && baseSha !== null);
  const reviewOldPath = review?.files.find((f) => f.path === activeFile)?.oldPath ?? null;
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
  const noteBefore = before !== null && before.path === activeFile ? before.text : null;
  const changesOn = shownNote !== null && noteBefore !== null && (changes[shownNote.path] ?? true);
  const showsChanges = shownNote !== null && noteBefore !== null && changesOn && !editsNote;
  const noCopyReason = before !== null && before.path === activeFile && before.error !== null ? before.error : NO_COPY;

  useEffect(() => {
    if (activeFile === null || !activeFile.startsWith(VAULT_PREFIX)) {
      return;
    }
    let live = true;
    const load = () => {
      const path = activeFile.slice(VAULT_PREFIX.length);
      const saved = noteChanges ? window.maple.vault.before(tabId, path) : Promise.resolve(null);
      const copy = saved.then(
        (text) => ({ path: activeFile, text, error: null }),
        (err: unknown) => ({ path: activeFile, text: null, error: errorText(err) }),
      );
      Promise.all([window.maple.vault.read(path), copy]).then(
        ([text, next]) => {
          if (live) {
            setReadError(null);
            setNote({ path: activeFile, text });
            setBefore(next);
          }
        },
        (err: unknown) => {
          if (live) {
            setReadError({ path: activeFile, message: errorText(err) });
          }
        },
      );
    };
    load();
    const unsubscribe = window.maple.vault.onChanged(load);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [tabId, activeFile, noteChanges]);

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
    if (headSha !== null && baseSha !== null) {
      window.maple.pr.readFile(tabId, activeFile, reviewOldPath, baseSha, headSha).then(
        (next) => {
          if (live) {
            setReadError(null);
            setPair(next);
          }
        },
        (err: unknown) => {
          if (live) {
            setReadError({ path: activeFile, message: errorText(err) });
          }
        },
      );
      return () => {
        live = false;
      };
    }
    const load = (keep: boolean) => {
      const top = keep ? (scrollTarget.current?.getScrollTop() ?? null) : null;
      void window.maple.repo.readFile(tabId, activeFile).then((next) => {
        if (live) {
          keepScroll.current = top;
          loadedFile.current = activeFile;
          setPair(next);
        }
      });
    };
    const reload = loadedFile.current === activeFile;
    if (watching || !reload) {
      load(reload);
    }
    if (!watching) {
      return () => {
        live = false;
      };
    }
    const unsubscribe = window.maple.repo.onChanged(tabId, () => {
      load(true);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [watching, tabId, activeFile, headSha, baseSha, reviewOldPath]);

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
  const changed = isChanged(shown);
  const sideBySide = changed && mode === 'side-by-side';
  const draft = text === null || review !== null ? null : Object.hasOwn(drafts, text.path) ? drafts[text.path] : null;
  const edited = draft?.text ?? text?.current ?? null;
  const commentable = canComment && text !== null && text.current !== null && !sideBySide && plain !== null;
  const held = activeFile !== null && shown === null && readError?.path !== activeFile ? pair : null;
  const heldChanged = isChanged(held);
  const heldComment =
    canComment &&
    held?.kind === 'text' &&
    held.current !== null &&
    !(heldChanged && mode === 'side-by-side') &&
    plain !== null;
  const ranges =
    text !== null && diff !== null && diff.headSha === headSha && Object.hasOwn(diff.ranges, text.path)
      ? diff.ranges[text.path]
      : [];
  const shownSelection = plain?.getSelection() ?? null;
  const selected =
    picked !== null && picked.editor === plain
      ? picked.lines
      : shownSelection === null || atFileStart(shownSelection)
        ? null
        : selectedLines(shownSelection);
  const inDiff = selected !== null && ranges.some(([start, end]) => start <= selected.start && selected.end <= end);
  const blocked = headSha === null ? NO_REVIEW : inDiff ? null : OUTSIDE_DIFF;

  const specs = useMemo(() => {
    if (showsChanges) {
      return toDecorations(lineMarks(noteBefore, shownNote.text));
    }
    return text !== null && edited !== null && text.base !== edited ? toDecorations(lineMarks(text.base, edited)) : [];
  }, [showsChanges, noteBefore, shownNote, text, edited]);

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
    if (!canComment || headSha === null || baseSha === null) {
      return;
    }
    let live = true;
    window.maple.pr.diffLines(tabId, baseSha, headSha).then(
      (next) => {
        if (live) {
          setDiff({ headSha, ...next });
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tabId, canComment, commentsRead, activeFile, headSha, baseSha]);

  useEffect(() => {
    if (plain === null) {
      return;
    }
    const subscription = plain.onDidChangeCursorSelection((e) => {
      setPicked({ editor: plain, lines: atFileStart(e.selection) ? null : selectedLines(e.selection) });
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
      commentable && headSha !== null && commenting !== null && commenting.path === textPath
        ? [{ id: 'new', line: commenting.end }]
        : [],
    [commentable, headSha, commenting, textPath],
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

  const edit = (value: string | undefined, change: editor.IModelContentChangedEvent) => {
    if (text === null || change.isFlush) {
      return;
    }
    onPin?.(text.path);
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
    onPin?.(shownNote.path);
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
        setSaveError({ path, message: errorText(err) });
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

  const mountDiff = (diff: editor.IStandaloneDiffEditor) => {
    setPlain(null);
    scrollTarget.current = diff.getModifiedEditor();
    setTarget(diff.getModifiedEditor());
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
              options={{ ...OPTIONS, readOnly: false, domReadOnly: false, wordWrap }}
              onChange={editNote}
              onMount={setPlain}
            />
          </div>
        </>
      );
    }
    if (showsChanges && mode === 'side-by-side') {
      return (
        <DiffEditor
          original={noteBefore}
          modified={shownNote.text}
          language="markdown"
          theme="vs-dark"
          height="100%"
          options={{ ...OPTIONS, renderSideBySide: true, originalEditable: false, wordWrap }}
          onMount={mountDiff}
        />
      );
    }
    if (showsChanges) {
      return (
        <div className={styles.editor}>
          <Editor
            value={shownNote.text}
            language="markdown"
            theme="vs-dark"
            height="100%"
            options={{ ...OPTIONS, wordWrap }}
            onMount={setPlain}
          />
        </div>
      );
    }
    if (showsNote && shownNote === null && readError?.path === activeFile) {
      return (
        <div className={styles.notice} role="alert">
          {`Reading the note failed: ${readError.message}`}
        </div>
      );
    }
    if (showsNote && markdown !== null) {
      return (
        <div className={wrap ? `${styles.noteView} ${styles.wrapped}` : styles.noteView}>
          <div ref={setNoteScroller} className={styles.description}>
            <MarkdownText text={markdown} />
          </div>
          <NoteOverview text={markdown} scroller={noteScroller} />
        </div>
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
      return readError?.path === activeFile ? (
        <div className={styles.notice} role="alert">
          {`Reading the file from GitHub failed: ${readError.message}`}
        </div>
      ) : null;
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
          onMount={mountDiff}
        />
      );
    }
    const locked = shown.current === null || review !== null;
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
            options={{ ...OPTIONS, readOnly: locked, domReadOnly: locked }}
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

  const modeButtons = (
    <div role="group" aria-label="Diff layout" data-variant="segmented">
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
  );

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
              className={[
                styles.tab,
                path === activeFile ? styles.active : '',
                path === preview ? styles.preview : '',
              ].join(' ')}
              onClick={() => {
                onActivate(path);
              }}
              onDoubleClick={() => {
                onPin?.(path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ path, x: e.clientX, y: e.clientY });
              }}
            >
              {label(path)}
              <button
                aria-label={`Close ${path === PR_DESCRIPTION || path === CARD_DESCRIPTION ? baseName(path) : path}`}
                className={styles.close}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFiles([path]);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
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
              aria-pressed={editsNote}
              onClick={() => {
                setEditing({ ...editing, [shownNote.path]: !editsNote });
                setChanges({ ...changes, [shownNote.path]: false });
              }}
            >
              Edit
            </button>
            {noteChanges && (
              <button
                aria-pressed={showsChanges}
                disabled={noteBefore === null || editsNote}
                title={noteBefore === null ? noCopyReason : editsNote ? LEAVE_EDIT : undefined}
                onClick={() => {
                  setChanges({ ...changes, [shownNote.path]: !changesOn });
                }}
              >
                Changes
              </button>
            )}
            <button
              aria-pressed={wrap}
              onClick={() => {
                setWrap(!wrap);
                saveWrap(!wrap);
              }}
            >
              Wrap
            </button>
            {showsChanges && modeButtons}
          </div>
        )}
        {!showsDescription && !showsNote && (
          <div className={styles.toggle}>
            {(changed || heldChanged) && modeButtons}
            {(commentable || heldComment) && (
              <button
                disabled={!commentable || selected === null}
                title={selected === null ? NO_SELECTION : (blocked ?? undefined)}
                onClick={() => {
                  if (!commentable || selected === null) {
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
      {menu !== null && (
        <FileTabMenu
          x={menu.x}
          y={menu.y}
          only={openFiles.length === 1}
          onClose={() => {
            onCloseFiles([menu.path]);
            setMenu(null);
          }}
          onCloseOthers={() => {
            onCloseFiles(openFiles.filter((file) => file !== menu.path));
            setMenu(null);
          }}
          onCloseAll={() => {
            onCloseFiles(openFiles);
            setMenu(null);
          }}
          onDismiss={() => {
            setMenu(null);
          }}
        />
      )}
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
        headSha !== null &&
        forms.map(({ node }) =>
          createPortal(
            <LineComment
              tabId={tabId}
              path={commenting.path}
              startLine={commenting.start === commenting.end ? null : commenting.start}
              line={commenting.end}
              headSha={headSha}
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
