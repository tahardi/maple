import type { TabState } from '@shared/types';
import { useRef, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import { useMaple } from '../store';
import { buildTree } from './buildTree';
import { cardActions } from './CardActions';
import { CardHeader } from './CardHeader';
import styles from './CardTab.module.css';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { MergedNotice } from './MergedNotice';
import { PrSummary } from './PrSummary';
import { useCardData } from './useCardData';
import { useColumns } from './useColumns';

const WAITING = 'Waiting for worktree…';

function branchName(worktreePath: string | null, cardKey: string): string | null {
  const name = worktreePath?.split('/').filter(Boolean).at(-1);
  const start = name?.indexOf(cardKey.toLowerCase()) ?? -1;
  return name === undefined || start === -1 ? null : name.slice(start);
}

export function CardTab({ tab }: { tab: TabState }) {
  const { changes, files, pr, card } = useCardData(tab);
  const config = useMaple((s) => s.config?.data ?? null);
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : 'idle'));
  const closeTab = useMaple((s) => s.closeTab);
  const [columns, setColumns] = useColumns();
  const [changedOverride, setChangedOverride] = useState<boolean | null>(null);
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const cardKey = tab.cardKey ?? '';
  const changedOnly = changedOverride ?? Boolean(pr?.data);
  const changed = changes?.files ?? [];
  const worktreeExists = tab.worktreePath !== null;
  const actions =
    config === null
      ? []
      : cardActions({
          config,
          cardKey,
          pr: pr?.data ?? null,
          dot,
          worktreeExists,
          send: (text) => {
            window.maple.session.sendPrompt(tab.id, text);
          },
          approve: () => {
            setApproveError(null);
            window.maple.pr.approve(tab.id).catch((err: unknown) => {
              setApproveError(err instanceof Error ? err.message : String(err));
            });
          },
        });

  const openFile = (path: string) => {
    setOpenFiles((files) => (files.includes(path) ? files : [...files, path]));
    setActiveFile(path);
  };

  const closeFile = (path: string) => {
    const rest = openFiles.filter((file) => file !== path);
    setOpenFiles(rest);
    if (path === activeFile) {
      setActiveFile(rest.at(-1) ?? null);
    }
  };

  const drag = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    const rect = body.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    e.preventDefault();
    let next = columns;
    const move = (ev: PointerEvent) => {
      next =
        side === 'left'
          ? { ...columns, left: Math.max(120, ev.clientX - rect.left) }
          : { ...columns, right: Math.min(80, Math.max(10, ((rect.right - ev.clientX) / rect.width) * 100)) };
      setColumns(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={styles.tab} data-testid="card-tab">
      <CardHeader
        cardKey={cardKey}
        card={card}
        pr={pr?.data ?? null}
        branch={branchName(tab.worktreePath, cardKey)}
        changes={changes}
      />
      <div ref={body} className={styles.body}>
        <div className={styles.left} style={{ width: columns.left }}>
          {tab.worktreePath === null ? (
            <div className={styles.waiting}>{WAITING}</div>
          ) : (
            <FileTree
              nodes={buildTree(files, changed, changedOnly)}
              selected={activeFile}
              onSelect={openFile}
              changedOnly={changedOnly}
              onToggle={setChangedOverride}
              changedCount={changed.length}
            />
          )}
          {pr && <PrSummary pr={pr} />}
        </div>
        <div className={styles.divider} onPointerDown={drag('left')} />
        <div className={styles.middle} data-testid="viewer-slot">
          {tab.worktreePath === null ? (
            <div className={styles.waiting}>{WAITING}</div>
          ) : (
            <FileViewer
              tabId={tab.id}
              openFiles={openFiles}
              activeFile={activeFile}
              onActivate={setActiveFile}
              onCloseFile={closeFile}
            />
          )}
        </div>
        <div className={styles.divider} onPointerDown={drag('right')} />
        <div className={styles.right} style={{ width: `${String(columns.right)}%` }} data-testid="claude-slot">
          {card?.status === 'Done' && !worktreeExists && <MergedNotice onClose={() => void closeTab(tab.id, false)} />}
          {approveError !== null && (
            <div className={styles.approveError} role="alert">
              {approveError}
            </div>
          )}
          <ClaudePane tabId={tab.id} actions={actions} />
        </div>
      </div>
    </div>
  );
}
