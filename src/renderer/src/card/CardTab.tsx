import { closePrompt } from '@shared/prompts';
import type { ReviewComment } from '@shared/types/github';
import type { TabState } from '@shared/types/tabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { useMaple } from '../store';
import { buildTree } from '@renderer/card/viewer/buildTree';
import { closeFiles } from '@renderer/card/viewer/closeFiles';
import { close, openPreview, pin, type OpenFileList } from '@renderer/card/viewer/openFileList';
import { cardActions } from './CardActions';
import { CardHeader } from './CardHeader';
import styles from './CardTab.module.css';
import { FileTree } from '@renderer/card/viewer/FileTree';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { MergedNotice } from './MergedNotice';
import { PrSummary } from './PrSummary';
import { RepoBranch } from '@renderer/card/viewer/RepoBranch';
import { QuickOpen } from '@renderer/card/viewer/QuickOpen';
import { PR_DESCRIPTION } from './prDescription';
import { CARD_DESCRIPTION } from './cardDescription';
import { TerminalPane } from '@renderer/card/terminal/TerminalPane';
import { useCardData } from './useCardData';
import { useColumns } from './useColumns';
import { useQuickOpenKeys, type QuickOpenMode } from '@renderer/card/viewer/useQuickOpenKeys';
import { namedNotes } from '@renderer/card/vault/namedNotes';
import { useVault } from '@renderer/card/vault/useVault';
import { writtenNotes } from '@renderer/card/vault/writtenNotes';
import { useViewed } from '@renderer/card/viewer/useViewed';
import { VAULT_PREFIX, VaultSwitch, type TreeView } from '@renderer/card/vault/VaultSwitch';

const WAITING = 'Waiting for worktree…';
const MERGED = 'Merged, worktree removed';
const CLOSED = 'Closed, worktree removed';
const CLOSE_WARNING =
  'Claude closes the PR without merging, deletes the branch and worktree, and moves the card to Done with the ' +
  'wont-do label. This cannot be undone.';

export function CardTab({ tab }: { tab: TabState }) {
  const { changes, files, repo, pr, review, reloadReview, card, cost } = useCardData(tab);
  const config = useMaple((s) => s.config?.data ?? null);
  const dot = useMaple((s) => (tab.id in s.statuses ? s.statuses[tab.id].dot : 'idle'));
  const closeTab = useMaple((s) => s.closeTab);
  const active = useMaple((s) => s.activeTabId === tab.id);
  const [columns, setColumns] = useColumns();
  const [changedOverride, setChangedOverride] = useState<boolean | null>(null);
  const [list, setList] = useState<OpenFileList>({ files: [], preview: null });
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [quickOpen, setQuickOpen] = useState<QuickOpenMode | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmFindings, setConfirmFindings] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [descriptionOpened, setDescriptionOpened] = useState(false);
  const [cardOpened, setCardOpened] = useState(false);
  const [terminal, setTerminal] = useState<'closed' | 'shown' | 'hidden'>('closed');
  const [viewOverride, setViewOverride] = useState<TreeView | null>(null);
  const [vaultChangedOnly, setVaultChangedOnly] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const cardKey = tab.cardKey ?? '';
  const changedOnly = changedOverride ?? Boolean(pr?.data);
  const pinned = review?.data ?? null;
  const changed = pinned?.files ?? changes?.files ?? [];
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
  const highFindings = pinned?.findings.filter((f) => f.severity === 'high').length ?? 0;
  const approvePr = () => {
    if (pinned === null) {
      return;
    }
    setApproveError(null);
    window.maple.pr.approve(tab.id, pinned.headSha).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setApproveError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    });
  };
  const findingNoun = highFindings === 1 ? 'finding' : 'findings';
  const findingsWarning = `${String(highFindings)} open high-severity ${findingNoun}. Approve anyway?`;
  const confirmViewed = () => {
    if (unviewed > 0) {
      setConfirmApprove(true);
    } else {
      approvePr();
    }
  };
  const actions =
    config === null
      ? []
      : cardActions({
          config,
          cardKey,
          pr: pr?.data ?? null,
          review: pinned,
          dot,
          worktreeExists,
          send: (text) => {
            window.maple.session.sendPrompt(tab.id, text);
          },
          approve: () => {
            if (highFindings > 0) {
              setConfirmFindings(true);
            } else {
              confirmViewed();
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

  const openFile = (path: string, at: number | null = null, keep = false) => {
    setList((now) => (keep ? pin(now, path) : openPreview(now, path)));
    setActiveFile(path);
    setLine(at);
  };

  const pinFile = (path: string) => {
    setList((now) => pin(now, path));
  };

  const activateFile = (path: string | null) => {
    setActiveFile(path);
    setLine(null);
  };

  if (!descriptionOpened && pr?.data) {
    setDescriptionOpened(true);
    setList((now) => ({ ...now, files: [PR_DESCRIPTION, ...now.files] }));
    setActiveFile((active) => active ?? PR_DESCRIPTION);
  }

  if (!cardOpened && card !== null && pr !== null && pr.data === null) {
    setCardOpened(true);
    setList((now) => ({ ...now, files: [CARD_DESCRIPTION, ...now.files] }));
    setActiveFile((active) => active ?? CARD_DESCRIPTION);
  }

  const closeTabs = (paths: readonly string[]) => {
    const next = closeFiles(list.files, activeFile, paths);
    setList((now) => close(now, paths));
    if (next.activeFile !== activeFile) {
      activateFile(next.activeFile);
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
        branch={repo?.branch ?? null}
        changes={pinned ?? changes}
        cost={cost}
        onOpenCard={() => {
          openFile(CARD_DESCRIPTION, null, true);
        }}
      />
      <div ref={body} className={styles.body}>
        <div className={styles.left} style={{ width: columns.left }} data-testid="tree-slot">
          {hasVault && <VaultSwitch view={view} onChange={setViewOverride} onRefresh={vault.refresh} />}
          {!showsVault && worktreeExists && repo !== null && <RepoBranch repo={repo} />}
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
              onPin={(path) => {
                pinFile(`${VAULT_PREFIX}${path}`);
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
              onPin={pinFile}
              changedOnly={changedOnly}
              onToggle={setChangedOverride}
              changedCount={changed.length}
              viewed={viewed}
              onToggleViewed={toggleViewed}
              commented={commented}
            />
          )}
          {pr && (
            <PrSummary
              pr={pr}
              onReloadReview={reloadReview}
              reviewError={review?.error ?? null}
              findings={pinned?.findings ?? []}
              projectRepo={config?.projects.find((p) => p.jiraKey === tab.projectKey)?.repo ?? null}
              headSha={pinned?.headSha ?? null}
              onOpenDescription={() => {
                openFile(PR_DESCRIPTION, null, true);
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
                openFiles={list.files}
                preview={list.preview}
                onPin={pinFile}
                activeFile={activeFile}
                onActivate={activateFile}
                onCloseFiles={closeTabs}
                prBody={pr?.data?.body ?? null}
                cardBody={card?.descriptionMd}
                canComment={pr?.data?.state === 'OPEN'}
                prFetchedAt={pr?.fetchedAt ?? null}
                onComments={showComments}
                line={line}
                review={pinned}
                noteChanges
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
      {confirmFindings && (
        <ConfirmDialog
          title="Open security findings"
          body={findingsWarning}
          confirmLabel="Approve anyway"
          danger
          onConfirm={() => {
            setConfirmFindings(false);
            confirmViewed();
          }}
          onCancel={() => {
            setConfirmFindings(false);
          }}
        />
      )}
      {confirmApprove && (
        <ConfirmDialog
          title="Unviewed files"
          body={`${String(unviewed)} changed ${unviewed === 1 ? 'file' : 'files'} not viewed. Approve anyway?`}
          confirmLabel="Approve anyway"
          danger
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
          danger
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
