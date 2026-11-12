import type { Draft } from '@shared/types/files/draft';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import { useState } from 'react';
import { useFileComments } from '@renderer/card/comments/useFileComments';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { CodeView } from '@renderer/card/viewer/code/CodeView';
import { NoteView } from '@renderer/card/viewer/note/NoteView';
import { baseName } from '@renderer/card/viewer/tabs/baseName';
import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';
import { FileTabMenu } from '@renderer/card/viewer/tabs/FileTabMenu';
import { PR_DESCRIPTION } from '@renderer/card/viewer/tabs/prDescription';
import { useMaple } from '@renderer/store';
import { DescriptionView } from './DescriptionView';
import styles from './FileViewer.module.css';

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

const NO_DRAFTS: Record<string, Draft> = {};

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
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tabId) ? s.drafts[tabId] : NO_DRAFTS));
  const { comments, diff, refresh } = useFileComments({
    tabId,
    canComment,
    review,
    activeFile,
    prFetchedAt,
    onComments,
  });

  const label = (path: string) => (Object.hasOwn(drafts, path) ? `● ${baseName(path)}` : baseName(path));

  const view = () => {
    if (activeFile === null) {
      return null;
    }
    if (activeFile === PR_DESCRIPTION) {
      return <DescriptionView text={prBody ?? ''} />;
    }
    if (activeFile === CARD_DESCRIPTION) {
      return <DescriptionView text={cardBody ?? ''} />;
    }
    if (activeFile.startsWith(VAULT_PREFIX)) {
      return <NoteView tabId={tabId} path={activeFile} noteChanges={noteChanges} onPin={onPin} toolbar={toolbar} />;
    }
    return (
      <CodeView
        tabId={tabId}
        path={activeFile}
        line={line}
        canComment={canComment}
        review={review}
        comments={comments}
        diff={diff}
        onCommentsChanged={refresh}
        onPin={onPin}
        toolbar={toolbar}
      />
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
        <div ref={setToolbar} />
      </div>
      <div className={styles.body}>{view()}</div>
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
    </div>
  );
}
