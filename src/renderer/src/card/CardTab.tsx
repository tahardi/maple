import type { ReviewComment } from '@shared/types/github/reviewComment';
import type { TabState } from '@shared/types/tabs/tabState';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { useMaple } from '../store';
import { buildTree } from '@renderer/card/viewer/tree/buildTree';
import { closeFiles } from '@renderer/card/viewer/tabs/closeFiles';
import { close, openPreview, pin, type OpenFileList } from '@renderer/card/viewer/tabs/openFileList';
import { cardActions } from './cardActions';
import { CardHeader } from './CardHeader';
import styles from './CardTab.module.css';
import { FileTree } from '@renderer/card/viewer/tree/FileTree';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { MergedNotice } from './MergedNotice';
import { PrSummary } from './PrSummary';
import { RepoBranch } from '@renderer/card/viewer/tree/RepoBranch';
import { WorktreeMenu } from '@renderer/card/viewer/tree/WorktreeMenu';
import { folderName } from '@renderer/card/viewer/tree/folderName';
import { QuickOpen } from '@renderer/card/viewer/quickOpen/QuickOpen';
import { PR_DESCRIPTION } from '@renderer/card/viewer/tabs/prDescription';
import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';
import { TerminalPane } from '@renderer/card/terminal/TerminalPane';
import { useCardData } from './useCardData';
import { useColumns } from './useColumns';
import { useQuickOpenKeys, type QuickOpenMode } from '@renderer/card/viewer/quickOpen/useQuickOpenKeys';
import { namedNotes } from '@renderer/card/vault/namedNotes';
import { useVault } from '@renderer/card/vault/useVault';
import { writtenNotes } from '@renderer/card/vault/writtenNotes';
import { useViewed } from '@renderer/card/viewer/tree/useViewed';
import { VAULT_PREFIX, VaultSwitch, type TreeView } from '@renderer/card/vault/VaultSwitch';

const WAITING = 'Waiting for worktree…';
const MERGED = 'Merged, worktree removed';
const CLOSED = 'Closed, worktree removed';

export function CardTab({ tab }: { tab: TabState }) {
  const { changes, files, repo, pr, review, reviewUpdated, reloadReview, card, cost, outsideSprint } = useCardData(tab);
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
  const [approveError, setApproveError] = useState<{ headSha: string; message: string } | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null);
  const [confirmFindings, setConfirmFindings] = useState<string | null>(null);
  const [descriptionOpened, setDescriptionOpened] = useState(false);
  const [cardOpened, setCardOpened] = useState(false);
  const [terminal, setTerminal] = useState<'closed' | 'shown' | 'hidden'>('closed');
  const [tryRuns, setTryRuns] = useState(0);
  const [viewOverride, setViewOverride] = useState<TreeView | null>(null);
  const [vaultChangedOnly, setVaultChangedOnly] = useState(true);
  const [shownWorktree, setShownWorktree] = useState(tab.worktreePath);
  const body = useRef<HTMLDivElement>(null);
  const cardKey = tab.cardKey ?? '';
  const changedOnly = changedOverride ?? Boolean(pr?.data);
  const pinned = review?.data ?? null;
  const changed = pinned?.files ?? changes?.files ?? [];
  const viewedScope =
    tab.worktreePaths.length > 1 && tab.worktreePath !== null ? `${folderName(tab.worktreePath)}:` : '';
  const { viewed, toggle: toggleViewed } = useViewed(cardKey, changed, viewedScope);
  const [commented, setCommented] = useState<ReadonlySet<string>>(new Set());
  const showComments = useCallback((comments: readonly ReviewComment[]) => {
    setCommented(new Set(comments.map((c) => c.path)));
  }, []);
  const unviewed = changed.length - viewed.size;
  const worktreeExists = tab.worktreePath !== null;
  useQuickOpenKeys(active && worktreeExists ? setQuickOpen : null);
  const wontDo = card?.labels.includes('wont-do') ?? false;
  const placeholder = card?.status === 'Done' ? (wontDo ? CLOSED : MERGED) : WAITING;
  const project = config?.projects.find((p) => p.jiraKey === tab.projectKey) ?? null;
  const hintsNoPr = card?.status === 'In Review' || outsideSprint;
  const searchedRepos = hintsNoPr && project !== null ? [project.repo, ...project.otherRepos] : [];
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
    const { headSha } = pinned;
    window.maple.pr.approve(tab.id, headSha).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setApproveError({ headSha, message: message.replace(/^Error invoking remote method '[^']+': Error: /, '') });
    });
  };
  const findingNoun = highFindings === 1 ? 'finding' : 'findings';
  const findingsWarning = `${String(highFindings)} open high-severity ${findingNoun}. Approve anyway?`;
  const confirmViewed = () => {
    if (unviewed > 0 && pinned !== null) {
      setConfirmApprove(pinned.headSha);
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
            if (highFindings > 0 && pinned !== null) {
              setConfirmFindings(pinned.headSha);
            } else {
              confirmViewed();
            }
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

  if (shownWorktree !== tab.worktreePath) {
    setShownWorktree(tab.worktreePath);
    if (shownWorktree !== null && tab.worktreePath !== null) {
      setList({ files: [], preview: null });
      setActiveFile(null);
      setChangedOverride(null);
      setApproveError(null);
      setDescriptionOpened(false);
      setCardOpened(false);
    }
  }

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
        projectRepo={project?.repo ?? null}
        onOpenCard={() => {
          openFile(CARD_DESCRIPTION, null, true);
        }}
      />
      <div ref={body} className={styles.body}>
        <div className={styles.left} style={{ width: columns.left }} data-testid="tree-slot">
          {hasVault && <VaultSwitch view={view} onChange={setViewOverride} onRefresh={vault.refresh} />}
          {!showsVault && tab.worktreePath !== null && tab.worktreePaths.length > 1 ? (
            <WorktreeMenu
              label={repo === null ? folderName(tab.worktreePath) : `${repo.name} · ${repo.branch}`}
              paths={tab.worktreePaths}
              selected={tab.worktreePath}
              onSelect={(path) => void window.maple.tabs.selectWorktree(tab.id, path)}
            >
              {repo === null ? undefined : <RepoBranch repo={repo} />}
            </WorktreeMenu>
          ) : (
            !showsVault && worktreeExists && repo !== null && <RepoBranch repo={repo} />
          )}
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
              onReloadReview={() => {
                setApproveError(null);
                reloadReview();
              }}
              reviewError={review?.error ?? null}
              findings={pinned?.findings ?? []}
              projectRepo={project?.repo ?? null}
              headSha={pinned?.headSha ?? null}
              updated={reviewUpdated}
              searchedRepos={searchedRepos}
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
            {repo?.hasTry === true && (
              <button
                aria-label="Run make try"
                onClick={() => {
                  setTerminal('shown');
                  setTryRuns((n) => n + 1);
                }}
              >
                make try
              </button>
            )}
            <button aria-pressed={terminal === 'shown'} onClick={toggleTerminal}>
              Terminal
            </button>
          </div>
          {terminal !== 'closed' && (
            <div className={styles.terminal} hidden={terminal === 'hidden'}>
              <TerminalPane tabId={tab.id} worktreePath={tab.worktreePath} tryRuns={tryRuns} />
            </div>
          )}
        </div>
        <div className={styles.divider} onPointerDown={drag('right')} />
        <div className={styles.right} style={{ width: `${String(columns.right)}%` }} data-testid="claude-slot">
          {card?.status === 'Done' && !worktreeExists && (
            <MergedNotice label={wontDo ? 'Closed' : 'Merged'} onClose={() => void closeTab(tab.id, false)} />
          )}
          {approveError !== null && approveError.headSha === pinned?.headSha && (
            <div className={styles.approveError} role="alert">
              {approveError.message}
            </div>
          )}
          <ClaudePane tabId={tab.id} actions={actions} />
        </div>
      </div>
      {confirmFindings !== null && confirmFindings === pinned?.headSha && (
        <ConfirmDialog
          title="Open security findings"
          body={findingsWarning}
          confirmLabel="Approve anyway"
          danger
          onConfirm={() => {
            setConfirmFindings(null);
            confirmViewed();
          }}
          onCancel={() => {
            setConfirmFindings(null);
          }}
        />
      )}
      {confirmApprove !== null && confirmApprove === pinned?.headSha && (
        <ConfirmDialog
          title="Unviewed files"
          body={`${String(unviewed)} changed ${unviewed === 1 ? 'file' : 'files'} not viewed. Approve anyway?`}
          confirmLabel="Approve anyway"
          danger
          onConfirm={() => {
            setConfirmApprove(null);
            approvePr();
          }}
          onCancel={() => {
            setConfirmApprove(null);
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
