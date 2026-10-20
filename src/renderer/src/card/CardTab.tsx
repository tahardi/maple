import type { TabState } from '@shared/types';
import { useEffect, useRef, useState } from 'react';
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
import { PR_DESCRIPTION } from './prDescription';
import { TerminalPane } from './TerminalPane';
import { useCardData } from './useCardData';
import { useColumns } from './useColumns';

const WAITING = 'Waiting for worktree…';
const MERGED = 'Merged, worktree removed';

function branchName(worktreePath: string | null, cardKey: string): string | null {
  const name = worktreePath?.split('/').filter(Boolean).at(-1);
  const start = name?.indexOf(cardKey.toLowerCase()) ?? -1;
  return name === undefined || start === -1 ? null : name.slice(start);
}

export function CardTab({ tab }: { tab: TabState }) {
  const { changes, files, pr, card, cost } = useCardData(tab);
  const config = useMaple((s) => s.config?.data ?? null);
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : 'idle'));
  const closeTab = useMaple((s) => s.closeTab);
  const active = useMaple((s) => s.activeTabId === tab.id);
  const [columns, setColumns] = useColumns();
  const [changedOverride, setChangedOverride] = useState<boolean | null>(null);
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [descriptionOpened, setDescriptionOpened] = useState(false);
  const [terminal, setTerminal] = useState<'closed' | 'shown' | 'hidden'>('closed');
  const body = useRef<HTMLDivElement>(null);
  const cardKey = tab.cardKey ?? '';
  const changedOnly = changedOverride ?? Boolean(pr?.data);
  const changed = changes?.files ?? [];
  const worktreeExists = tab.worktreePath !== null;
  const placeholder = card?.status === 'Done' ? MERGED : WAITING;
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
              const message = err instanceof Error ? err.message : String(err);
              setApproveError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
            });
          },
        });

  const toggleTerminal = () => {
    setTerminal((t) => (t === 'shown' ? 'hidden' : 'shown'));
  };

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);

  const openFile = (path: string) => {
    setOpenFiles((files) => (files.includes(path) ? files : [...files, path]));
    setActiveFile(path);
  };

  if (!descriptionOpened && pr?.data) {
    setDescriptionOpened(true);
    setOpenFiles((files) => [PR_DESCRIPTION, ...files]);
    setActiveFile((active) => active ?? PR_DESCRIPTION);
  }

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
        cost={cost}
      />
      <div ref={body} className={styles.body}>
        <div className={styles.left} style={{ width: columns.left }}>
          {tab.worktreePath === null ? (
            <div className={styles.waiting}>{placeholder}</div>
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
          {pr && (
            <PrSummary
              pr={pr}
              onOpenDescription={() => {
                openFile(PR_DESCRIPTION);
              }}
            />
          )}
        </div>
        <div className={styles.divider} onPointerDown={drag('left')} />
        <div className={styles.middle} data-testid="viewer-slot">
          <div className={styles.viewer}>
            {tab.worktreePath === null ? (
              <div className={styles.waiting}>{placeholder}</div>
            ) : (
              <FileViewer
                tabId={tab.id}
                openFiles={openFiles}
                activeFile={activeFile}
                onActivate={setActiveFile}
                onCloseFile={closeFile}
                prBody={pr?.data?.body ?? null}
              />
            )}
          </div>
          <div className={styles.terminalBar}>
            <button aria-pressed={terminal === 'shown'} onClick={toggleTerminal}>
              Terminal
            </button>
          </div>
          {terminal !== 'closed' && (
            <div className={styles.terminal} hidden={terminal === 'hidden'}>
              <TerminalPane tabId={tab.id} />
            </div>
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
