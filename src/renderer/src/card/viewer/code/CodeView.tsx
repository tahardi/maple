import { DiffEditor, Editor, useMonaco } from '@monaco-editor/react';
import type { DiffLines } from '@shared/types/files/diffLines';
import type { Draft } from '@shared/types/files/draft';
import type { FilePair } from '@shared/types/files/filePair';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import type { editor, IRange } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CommentThread } from '@renderer/card/comments/CommentThread';
import { toThreads } from '@renderer/card/comments/commentThreads';
import { LineComment } from '@renderer/card/comments/LineComment';
import { useLineZones } from '@renderer/card/comments/useLineZones';
import { DraftNotices } from '@renderer/card/viewer/draft/DraftNotices';
import { isSaveKey } from '@renderer/card/viewer/draft/isSaveKey';
import { useDraftSave } from '@renderer/card/viewer/draft/useDraftSave';
import { DiffModeButtons } from '@renderer/card/viewer/editor/DiffModeButtons';
import { EDITOR_OPTIONS } from '@renderer/card/viewer/editor/editorOptions';
import '@renderer/card/viewer/editor/monacoSetup';
import { linesLabel, selectedLines, type Lines } from '@renderer/card/viewer/editor/selectedLines';
import { useDiffMode } from '@renderer/card/viewer/editor/useDiffMode';
import { useLineMarks } from '@renderer/card/viewer/editor/useLineMarks';
import { baseName } from '@renderer/card/viewer/tabs/baseName';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';
import styles from '../FileViewer.module.css';
import { useFilePair } from './useFilePair';

const NO_DRAFTS: Record<string, Draft> = {};

const OUTSIDE_DIFF = 'GitHub only accepts comments on lines in the PR diff';

const NO_REVIEW = 'Review not loaded: click Reload review to pin comments to the reviewed commit';

const NO_SELECTION = 'Select lines to comment on';

function isChanged(pair: FilePair | null): boolean {
  return pair?.kind === 'text' && pair.current !== null && pair.base !== pair.current;
}

function atFileStart(range: IRange): boolean {
  return range.startLineNumber === 1 && range.startColumn === 1 && range.endLineNumber === 1 && range.endColumn === 1;
}

export function CodeView({
  tabId,
  path,
  line,
  canComment,
  review,
  comments,
  diff,
  onCommentsChanged,
  onPin,
  toolbar,
}: {
  tabId: string;
  path: string;
  line: number | null;
  canComment: boolean;
  review: Review | null;
  comments: readonly ReviewComment[];
  diff: ({ headSha: string } & DiffLines) | null;
  onCommentsChanged: () => void;
  onPin?: (path: string) => void;
  toolbar: HTMLElement | null;
}) {
  const monaco = useMonaco();
  const { mode, choose } = useDiffMode();
  const [plain, setPlain] = useState<editor.ICodeEditor | null>(null);
  const scrollTarget = useRef<editor.ICodeEditor | null>(null);
  const [target, setTarget] = useState<editor.ICodeEditor | null>(null);
  const { pair, readError, setPair } = useFilePair(tabId, path, review, scrollTarget);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const setDraft = useMaple((s) => s.setDraft);
  const { saveError, persist } = useDraftSave(tabId);
  const pendingLine = useRef<number | null>(null);
  const [commenting, setCommenting] = useState<({ path: string } & Lines) | null>(null);
  const [refused, setRefused] = useState<({ path: string } & Lines) | null>(null);
  const [picked, setPicked] = useState<{ editor: editor.ICodeEditor; lines: Lines | null } | null>(null);

  const headSha = review?.headSha ?? null;
  const shown = pair !== null && pair.path === path ? pair : null;

  useEffect(() => {
    pendingLine.current = line;
  }, [line, path]);

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
  const held = shown === null && readError?.path !== path ? pair : null;
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

  useLineMarks(plain, text?.base ?? null, edited);

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
    if (monaco === null) {
      return undefined;
    }
    const name = baseName(path);
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : null;
    return monaco.languages
      .getLanguages()
      .find((l) => (ext !== null && l.extensions?.includes(ext)) || l.filenames?.includes(name))?.id;
  }, [path, monaco]);

  const edit = (value: string | undefined, change: editor.IModelContentChangedEvent) => {
    if (text === null || change.isFlush) {
      return;
    }
    onPin?.(text.path);
    const next = value ?? '';
    setDraft(tabId, text.path, next === text.current ? null : { text: next, disk: text.current });
  };

  const save = (e: KeyboardEvent) => {
    if (!isSaveKey(e) || text === null || draft === null) {
      return;
    }
    persist(text.path, window.maple.repo.writeFile(tabId, text.path, draft.text), () => {
      setPair({ ...text, current: draft.text });
    });
  };

  const mountDiff = (diffEditor: editor.IStandaloneDiffEditor) => {
    setPlain(null);
    scrollTarget.current = diffEditor.getModifiedEditor();
    setTarget(diffEditor.getModifiedEditor());
  };

  const body = () => {
    if (shown === null) {
      return readError?.path === path ? (
        <Notice tone="danger">{`Reading the file from GitHub failed: ${readError.message}`}</Notice>
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
          options={{ ...EDITOR_OPTIONS, renderSideBySide: true, originalEditable: false }}
          onMount={mountDiff}
        />
      );
    }
    const locked = shown.current === null || review !== null;
    return (
      <>
        {shown.current === null && <Notice tone="info">Deleted in this branch</Notice>}
        <DraftNotices tabId={tabId} path={shown.path} draft={draft} disk={shown.current} saveError={saveError} />
        {commentable &&
          blocked !== null &&
          refused?.path === shown.path &&
          refused.start === selected?.start &&
          refused.end === selected.end && (
            <Notice tone="danger">{`Can't comment on ${linesLabel(refused)}. ${blocked}`}</Notice>
          )}
        <div className={styles.editor} onKeyDown={save}>
          <Editor
            value={edited ?? shown.base ?? ''}
            language={language}
            theme="vs-dark"
            height="100%"
            options={{ ...EDITOR_OPTIONS, readOnly: locked, domReadOnly: locked }}
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
    <>
      {toolbar !== null &&
        createPortal(
          <div className={styles.toggle}>
            {(changed || heldChanged) && <DiffModeButtons mode={mode} onChoose={choose} />}
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
          </div>,
          toolbar,
        )}
      {body()}
      {zones.map(({ item, node }) =>
        createPortal(<CommentThread tabId={tabId} thread={item} onPosted={onCommentsChanged} />, node, item.id),
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
                onCommentsChanged();
              }}
            />,
            node,
            'new',
          ),
        )}
    </>
  );
}
