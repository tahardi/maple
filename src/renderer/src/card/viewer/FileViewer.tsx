import type { Fetched } from '@shared/types/app/fetched';
import type { Draft } from '@shared/types/files/draft';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import type { Review } from '@shared/types/github/review';
import type { ReviewComment } from '@shared/types/github/reviewComment';
import { useState } from 'react';
import { useFileComments } from '@renderer/card/comments/useFileComments';
import { FindingsView } from '@renderer/card/findings/FindingsView';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { CodeView } from '@renderer/card/viewer/code/CodeView';
import { NoteView } from '@renderer/card/viewer/note/NoteView';
import { baseName } from '@renderer/card/viewer/tabs/baseName';
import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';
import { FileTabMenu } from '@renderer/card/viewer/tabs/FileTabMenu';
import { FINDINGS } from '@renderer/card/viewer/tabs/findingsTab';
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
  onReloadReview?: () => void;
  findings?: Fetched<FindingsFile> | null;
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
  onReloadReview,
  findings = null,
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
    if (activeFile === FINDINGS) {
      return <FindingsView tabId={tabId} file={findings?.data ?? null} error={findings?.error ?? null} />;
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
        onReloadReview={onReloadReview}
        toolbar={toolbar}
      />
    );
  };

  return (
    <div className={styles.viewer}>
      <div className={styles.bar}>
        <div className={styles.tabs} role="tablist">
          {openFiles.map((path) => (
            <div key={path} className={path === activeFile ? `${styles.tab} ${styles.active}` : styles.tab}>
              <button
                role="tab"
                aria-label={label(path)}
                aria-selected={path === activeFile}
                title={path}
                className={path === preview ? `${styles.label} ${styles.preview}` : styles.label}
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
              </button>
              <button
                aria-label={`Close ${[PR_DESCRIPTION, CARD_DESCRIPTION, FINDINGS].includes(path) ? baseName(path) : path}`}
                className={styles.close}
                onClick={() => {
                  onCloseFiles([path]);
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
