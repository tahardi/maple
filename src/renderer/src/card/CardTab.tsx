import { closePrompt } from '@shared/prompts';
import type { FileChange, VaultNote } from '@shared/types/files';
import type { ReviewComment } from '@shared/types/github';
import type { TabState } from '@shared/types/tabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { useMaple } from '../store';
import { buildTree } from '@renderer/card/viewer/buildTree';
import { cardActions } from './CardActions';
import { CardHeader } from './CardHeader';
import styles from './CardTab.module.css';
import { FileTree } from '@renderer/card/viewer/FileTree';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { MergedNotice } from './MergedNotice';
import { PrSummary } from './PrSummary';
import { QuickOpen } from '@renderer/card/viewer/QuickOpen';
import { PR_DESCRIPTION } from './prDescription';
import { CARD_DESCRIPTION } from './cardDescription';
import { TerminalPane } from '@renderer/card/terminal/TerminalPane';
import { useCardData } from './useCardData';
import { useColumns } from './useColumns';
import { useQuickOpenKeys, type QuickOpenMode } from '@renderer/card/viewer/useQuickOpenKeys';
import { namedNotes } from '@renderer/card/vault/namedNotes';
import { useVault } from '@renderer/card/vault/useVault';
import { useViewed } from '@renderer/card/viewer/useViewed';
import { VAULT_PREFIX, VaultSwitch, type TreeView } from '@renderer/card/vault/VaultSwitch';

const WAITING = 'Waiting for worktree…';
const MERGED = 'Merged, worktree removed';
const CLOSED = 'Closed, worktree removed';
const CLOSE_WARNING =
  'Claude closes the PR without merging, deletes the branch and worktree, and moves the card to Done with the ' +
  'wont-do label. This cannot be undone.';

function writtenNotes(notes: readonly VaultNote[], written: readonly string[]): FileChange[] {
  const paths = new Set(written);
  return notes
    .filter((note) => paths.has(note.path))
    .map((note) => ({ path: note.path, status: 'M', oldPath: null, stamp: null }));
}

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
  const [line, setLine] = useState<number | null>(null);
  const [quickOpen, setQuickOpen] = useState<QuickOpenMode | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [descriptionOpened, setDescriptionOpened] = useState(false);
  const [cardOpened, setCardOpened] = useState(false);
  const [terminal, setTerminal] = useState<'closed' | 'shown' | 'hidden'>('closed');
  const [viewOverride, setViewOverride] = useState<TreeView | null>(null);
  const [vaultChangedOnly, setVaultChangedOnly] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const cardKey = tab.cardKey ?? '';
  const changedOnly = changedOverride ?? Boolean(pr?.data);
  const changed = changes?.files ?? [];
  const { viewed, toggle: toggleViewed } = useViewed(cardKey, changed);
  const [commented, setCommented] = useState<ReadonlySet<string>>(new Set());
  const showComments = useCallback((comments: readonly ReviewComment[]) => {
    setCommented(new Set(comments.map((c) => c.path)));
  }, []);
  const unviewed = changed.length - viewed.size;
  const worktreeExists = tab.worktreePath !== null;
  useQuickOpenKeys(active && worktreeExists ? setQuickOpen : null);
  const wontDo = card?.labels.includes('wont-do') ?? false;
  const placeholder = card?.status === 'Done' ? (wontDo ? CLOSED : MERGED) : WAITING;
  const hasVault = (config?.vaultDir ?? null) !== null;
  const view = viewOverride ?? (worktreeExists ? 'worktree' : 'vault');
  const showsVault = hasVault && view === 'vault';
  const vault = useVault(tab.id, showsVault);
  const recent = writtenNotes(vault.notes, [
    ...vault.written,
    ...namedNotes(
      card?.descriptionMd ?? '',
      vault.notes.map((note) => note.path),
    ),
  ]);
  const approvePr = () => {
    setApproveError(null);
    window.maple.pr.approve(tab.id).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setApproveError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    });
  };
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
            if (unviewed > 0) {
              setConfirmApprove(true);
            } else {
              approvePr();
            }
          },
          close: () => {
            setConfirmClose(true);
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

  const openFile = (path: string, at: number | null = null) => {
    setOpenFiles((files) => (files.includes(path) ? files : [...files, path]));
    setActiveFile(path);
    setLine(at);
  };

  const activateFile = (path: string | null) => {
    setActiveFile(path);
    setLine(null);
  };

  if (!descriptionOpened && pr?.data) {
    setDescriptionOpened(true);
    setOpenFiles((files) => [PR_DESCRIPTION, ...files]);
    setActiveFile((active) => active ?? PR_DESCRIPTION);
  }

  if (!cardOpened && card !== null && pr !== null && pr.data === null) {
    setCardOpened(true);
    setOpenFiles((files) => [CARD_DESCRIPTION, ...files]);
    setActiveFile((active) => active ?? CARD_DESCRIPTION);
  }

  const closeFile = (path: string) => {
    const rest = openFiles.filter((file) => file !== path);
    setOpenFiles(rest);
    if (path === activeFile) {
      activateFile(rest.at(-1) ?? null);
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
        <div className={styles.left} style={{ width: columns.left }} data-testid="tree-slot">
          {hasVault && <VaultSwitch view={view} onChange={setViewOverride} onRefresh={vault.refresh} />}
          {showsVault ? (
            <FileTree
              key="vault"
              nodes={buildTree(
                vault.notes.map((note) => note.path),
                recent,
                vaultChangedOnly,
              )}
              selected={activeFile?.startsWith(VAULT_PREFIX) ? activeFile.slice(VAULT_PREFIX.length) : null}
              onSelect={(path) => {
                openFile(`${VAULT_PREFIX}${path}`);
              }}
              changedOnly={vaultChangedOnly}
              onToggle={setVaultChangedOnly}
              changedCount={recent.length}
            />
          ) : tab.worktreePath === null ? (
            <div className={styles.waiting}>{placeholder}</div>
          ) : (
            <FileTree
              key="worktree"
              nodes={buildTree(files, changed, changedOnly)}
              selected={activeFile}
              onSelect={openFile}
              changedOnly={changedOnly}
              onToggle={setChangedOverride}
              changedCount={changed.length}
              viewed={viewed}
              onToggleViewed={toggleViewed}
              commented={commented}
            />
          )}
          {card !== null && (
            <button
              className={styles.cardDescription}
              onClick={() => {
                openFile(CARD_DESCRIPTION);
              }}
            >
              Card description
            </button>
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
            {tab.worktreePath === null && !showsVault ? (
              <div className={styles.waiting}>{placeholder}</div>
            ) : (
              <FileViewer
                tabId={tab.id}
                openFiles={openFiles}
                activeFile={activeFile}
                onActivate={activateFile}
                onCloseFile={closeFile}
                prBody={pr?.data?.body ?? null}
                cardBody={card?.descriptionMd}
                canComment={pr?.data?.state === 'OPEN'}
                prFetchedAt={pr?.fetchedAt ?? null}
                onComments={showComments}
                line={line}
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
          {card?.status === 'Done' && !worktreeExists && (
            <MergedNotice label={wontDo ? 'Closed' : 'Merged'} onClose={() => void closeTab(tab.id, false)} />
          )}
          {approveError !== null && (
            <div className={styles.approveError} role="alert">
              {approveError}
            </div>
          )}
          <ClaudePane tabId={tab.id} actions={actions} />
        </div>
      </div>
      {confirmApprove && (
        <ConfirmDialog
          title="Unviewed files"
          body={`${String(unviewed)} changed ${unviewed === 1 ? 'file' : 'files'} not viewed. Approve anyway?`}
          confirmLabel="Approve anyway"
          onConfirm={() => {
            setConfirmApprove(false);
            approvePr();
          }}
          onCancel={() => {
            setConfirmApprove(false);
          }}
        />
      )}
      {confirmClose && (
        <ConfirmDialog
          title={`Close ${cardKey}?`}
          body={CLOSE_WARNING}
          confirmLabel="Close card"
          onConfirm={() => {
            setConfirmClose(false);
            window.maple.session.sendPrompt(tab.id, closePrompt(cardKey));
          }}
          onCancel={() => {
            setConfirmClose(false);
          }}
        />
      )}
      {quickOpen !== null && (
        <QuickOpen
          tabId={tab.id}
          files={files}
          mode={quickOpen}
          onOpen={(path, at) => {
            setQuickOpen(null);
            openFile(path, at);
          }}
          onClose={() => {
            setQuickOpen(null);
          }}
        />
      )}
    </div>
  );
}
