import { DiffEditor, Editor } from '@monaco-editor/react';
import { errorText } from '@shared/errors/errorText';
import type { Draft } from '@shared/types/files/draft';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { DraftNotices } from '@renderer/card/viewer/draft/DraftNotices';
import { isSaveKey } from '@renderer/card/viewer/draft/isSaveKey';
import { useDraftSave } from '@renderer/card/viewer/draft/useDraftSave';
import { DiffModeButtons } from '@renderer/card/viewer/editor/DiffModeButtons';
import { EDITOR_OPTIONS } from '@renderer/card/viewer/editor/editorOptions';
import '@renderer/card/viewer/editor/monacoSetup';
import { useDiffMode } from '@renderer/card/viewer/editor/useDiffMode';
import { useLineMarks } from '@renderer/card/viewer/editor/useLineMarks';
import { NoteOverview } from '@renderer/card/viewer/overview/NoteOverview';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import styles from '../FileViewer.module.css';

const WRAP_KEY = 'maple.noteWrap';

const LEAVE_EDIT = 'Turn off Edit to see changes';

const NO_DRAFTS: Record<string, Draft> = {};

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

export function NoteView({
  tabId,
  path,
  noteChanges,
  onPin,
  toolbar,
}: {
  tabId: string;
  path: string;
  noteChanges: boolean;
  onPin?: (path: string) => void;
  toolbar: HTMLElement | null;
}) {
  const { mode, choose } = useDiffMode();
  const [wrap, setWrap] = useState(loadWrap);
  const [note, setNote] = useState<{ path: string; text: string } | null>(null);
  const [readError, setReadError] = useState<{ path: string; message: string } | null>(null);
  const [noteScroller, setNoteScroller] = useState<HTMLDivElement | null>(null);
  const [before, setBefore] = useState<{ path: string; text: string | null; error: string | null } | null>(null);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const setDraft = useMaple((s) => s.setDraft);
  const { saveError, persist } = useDraftSave(tabId);

  const wordWrap = wrap ? 'on' : 'off';
  const shownNote = note !== null && note.path === path ? note : null;
  const noteDraft = shownNote !== null && Object.hasOwn(drafts, shownNote.path) ? drafts[shownNote.path] : null;
  const editsNote = shownNote !== null && (editing[shownNote.path] ?? noteDraft !== null);
  const noteBefore = before !== null && before.path === path ? before.text : null;
  const changesOn = shownNote !== null && noteBefore !== null && (changes[shownNote.path] ?? true);
  const showsChanges = shownNote !== null && noteBefore !== null && changesOn && !editsNote;
  const copyError = before !== null && before.path === path ? before.error : null;

  useEffect(() => {
    let live = true;
    const load = () => {
      const bare = path.slice(VAULT_PREFIX.length);
      const saved = noteChanges ? window.maple.vault.before(tabId, bare) : Promise.resolve(null);
      const copy = saved.then(
        (text) => ({ path, text, error: null }),
        (err: unknown) => ({ path, text: null, error: errorText(err) }),
      );
      Promise.all([window.maple.vault.read(bare), copy]).then(
        ([text, next]) => {
          if (live) {
            setReadError(null);
            setNote({ path, text });
            setBefore(next);
          }
        },
        (err: unknown) => {
          if (live) {
            setReadError({ path, message: errorText(err) });
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
  }, [tabId, path, noteChanges]);

  useLineMarks(plain, noteBefore, showsChanges ? shownNote.text : null);

  const keepEditing = (notePath: string) => {
    setEditing((now) => ({ ...now, [notePath]: true }));
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

  const saveNote = (e: KeyboardEvent) => {
    if (!isSaveKey(e) || shownNote === null || noteDraft === null) {
      return;
    }
    persist(shownNote.path, window.maple.vault.write(shownNote.path.slice(VAULT_PREFIX.length), noteDraft.text), () => {
      setNote({ ...shownNote, text: noteDraft.text });
      keepEditing(shownNote.path);
    });
  };

  const mountDiff = () => {
    setPlain(null);
  };

  const body = () => {
    if (editsNote) {
      return (
        <>
          <DraftNotices
            tabId={tabId}
            path={shownNote.path}
            draft={noteDraft}
            disk={shownNote.text}
            saveError={saveError}
            onReload={() => {
              keepEditing(shownNote.path);
            }}
          />
          <div className={styles.editor} onKeyDown={saveNote}>
            <Editor
              value={noteDraft?.text ?? shownNote.text}
              language="markdown"
              theme="vs-dark"
              height="100%"
              options={{ ...EDITOR_OPTIONS, readOnly: false, domReadOnly: false, wordWrap }}
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
          options={{ ...EDITOR_OPTIONS, renderSideBySide: true, originalEditable: false, wordWrap }}
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
            options={{ ...EDITOR_OPTIONS, wordWrap }}
            onMount={setPlain}
          />
        </div>
      );
    }
    if (shownNote === null) {
      return readError?.path === path ? (
        <Notice tone="danger">{`Reading the note failed: ${readError.message}`}</Notice>
      ) : null;
    }
    return (
      <div className={wrap ? `${styles.noteView} ${styles.wrapped}` : styles.noteView}>
        <div ref={setNoteScroller} className={styles.description}>
          <MarkdownText text={shownNote.text} />
        </div>
        <NoteOverview text={shownNote.text} scroller={noteScroller} />
      </div>
    );
  };

  return (
    <>
      {toolbar !== null &&
        shownNote !== null &&
        createPortal(
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
            {noteChanges && (noteBefore !== null || copyError !== null) && (
              <Button
                label="Changes"
                pressed={showsChanges}
                disabled={noteBefore === null || editsNote}
                reason={copyError ?? (editsNote ? LEAVE_EDIT : null)}
                onClick={() => {
                  setChanges({ ...changes, [shownNote.path]: !changesOn });
                }}
              />
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
            {showsChanges && <DiffModeButtons mode={mode} onChoose={choose} />}
          </div>,
          toolbar,
        )}
      {body()}
    </>
  );
}
