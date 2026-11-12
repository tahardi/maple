import type { ReviewComment } from '@shared/types/github/reviewComment';
import type { TabState } from '@shared/types/tabs/tabState';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClaudePane } from '../claude/ClaudePane';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { useMaple } from '../store';
import { buildTree } from '@renderer/card/viewer/tree/buildTree';
import { cardActions } from './cardActions';
import { CardHeader } from './CardHeader';
import styles from './CardTab.module.css';
import { FileTree } from '@renderer/card/viewer/tree/FileTree';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { Notice } from '../shell/blocks/Notice';
import { CiBadge } from './CiBadge';
import { WorktreeMenu } from '@renderer/card/viewer/tree/WorktreeMenu';
import { folderName } from '@renderer/card/viewer/tree/folderName';
import { QuickOpen } from '@renderer/card/viewer/quickOpen/QuickOpen';
import { PR_DESCRIPTION } from '@renderer/card/viewer/tabs/prDescription';
import { CARD_DESCRIPTION } from '@renderer/card/viewer/tabs/cardDescription';
import { TerminalPane } from '@renderer/card/terminal/TerminalPane';
import { useCardData } from './useCardData';
import { useApproveFlow } from './useApproveFlow';
import { useWorktreeState } from './useWorktreeState';
import { useColumnDrag } from '@renderer/shell/split/useColumnDrag';
import { SplitHandle } from '@renderer/shell/split/SplitHandle';
import { splitSize } from '@renderer/shell/split/splitSize';
import { useOpenFiles } from '@renderer/card/viewer/tabs/useOpenFiles';
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
  const body = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const left = useColumnDrag(body, {
    storageKey: 'maple.columns.left',
    initial: 240,
    min: 120,
    max: 480,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'start', unit: 'px', min: 120, max: 480 }),
  });
  const right = useColumnDrag(body, {
    storageKey: 'maple.columns.right',
    initial: 32,
    min: 10,
    max: 80,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'end', unit: '%', min: 10, max: 80 }),
  });
  const terminalDrag = useColumnDrag(middle, {
    storageKey: 'maple.split.cardTerminal',
    initial: 35,
    min: 10,
    max: 80,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'y', edge: 'end', unit: '%', min: 10, max: 80 }),
  });
  const [changedOverride, setChangedOverride] = useWorktreeState<boolean | null>(tab.worktreePath, null);
  const openFiles = useOpenFiles(tab.worktreePath, {
    pr: Boolean(pr?.data),
    card: card !== null && pr !== null && pr.data === null,
  });
  const { activeFile, open: openFile, pin: pinFile } = openFiles;
  const [quickOpen, setQuickOpen] = useState<QuickOpenMode | null>(null);
  const [terminal, setTerminal] = useState<'closed' | 'shown' | 'hidden'>('closed');
  const [tryRuns, setTryRuns] = useState(0);
  const [viewOverride, setViewOverride] = useState<TreeView | null>(null);
  const [vaultChangedOnly, setVaultChangedOnly] = useState(true);
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
  const approval = useApproveFlow(tab.id, tab.worktreePath, pinned, unviewed);
  const reloadPinnedReview = () => {
    approval.clearError();
    reloadReview();
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
          approving: approval.approving,
          send: (text) => {
            window.maple.session.sendPrompt(tab.id, text);
          },
          approve: approval.approve,
          reloadReview: reloadPinnedReview,
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

  return (
    <div className={styles.tab} data-testid="card-tab">
      <CardHeader
        cardKey={cardKey}
        card={card}
        pr={pr}
        searchedRepos={searchedRepos}
        ci={pr?.data && <CiBadge pr={pr.data} reviewError={review?.error ?? null} findings={pinned?.findings ?? []} />}
        reviewedSha={pinned?.headSha ?? null}
        reviewUpdated={reviewUpdated}
        branch={repo?.branch ?? null}
        changes={pinned ?? changes}
        cost={cost}
        projectRepo={project?.repo ?? null}
        onOpenCard={() => {
          openFile(CARD_DESCRIPTION, null, true);
        }}
        onOpenPr={() => {
          openFile(PR_DESCRIPTION, null, true);
        }}
      />
      <div ref={body} className={styles.body}>
        <div className={styles.left} style={{ width: left.size }} data-testid="tree-slot">
          {hasVault && <VaultSwitch view={view} onChange={setViewOverride} onRefresh={vault.refresh} />}
          {!showsVault && tab.worktreePath !== null && tab.worktreePaths.length > 1 && (
            <WorktreeMenu
              label={repo?.name ?? folderName(tab.worktreePath)}
              paths={tab.worktreePaths}
              selected={tab.worktreePath}
              onSelect={(path) => void window.maple.tabs.selectWorktree(tab.id, path)}
            />
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
              onToggle={(on) => {
                setChangedOverride(() => on);
              }}
              changedCount={changed.length}
              viewed={viewed}
              onToggleViewed={toggleViewed}
              commented={commented}
            />
          )}
        </div>
        <SplitHandle drag={left} axis="x" label="Resize file tree" />
        <div ref={middle} className={styles.middle} data-testid="viewer-slot">
          <div className={styles.viewer}>
            {tab.worktreePath === null && !showsVault ? (
              <div className={styles.waiting}>{placeholder}</div>
            ) : (
              <FileViewer
                tabId={tab.id}
                openFiles={openFiles.files}
                preview={openFiles.preview}
                onPin={pinFile}
                activeFile={activeFile}
                onActivate={openFiles.activate}
                onCloseFiles={openFiles.close}
                prBody={pr?.data?.body ?? null}
                cardBody={card?.descriptionMd}
                canComment={pr?.data?.state === 'OPEN'}
                prFetchedAt={pr?.fetchedAt ?? null}
                onComments={showComments}
                line={openFiles.line}
                review={pinned}
                onReloadReview={reloadPinnedReview}
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
            <button
              aria-pressed={terminal === 'shown'}
              title="Show or hide the terminal (Ctrl+`)"
              aria-keyshortcuts="Control+`"
              onClick={toggleTerminal}
            >
              Terminal <kbd aria-hidden="true">Ctrl+`</kbd>
            </button>
          </div>
          {terminal === 'shown' && <SplitHandle drag={terminalDrag} axis="y" label="Resize terminal" />}
          {terminal !== 'closed' && (
            <div
              className={styles.terminal}
              style={{ height: `${String(terminalDrag.size)}%` }}
              hidden={terminal === 'hidden'}
            >
              <TerminalPane tabId={tab.id} worktreePath={tab.worktreePath} tryRuns={tryRuns} />
            </div>
          )}
        </div>
        <SplitHandle drag={right} axis="x" label="Resize Claude pane" />
        <div className={styles.right} style={{ width: `${String(right.size)}%` }} data-testid="claude-slot">
          {card?.status === 'Done' && !worktreeExists && (
            <Notice tone="success">
              <span>{wontDo ? 'Closed' : 'Merged'}</span>
              <button onClick={() => void closeTab(tab.id, false)}>Close tab</button>
            </Notice>
          )}
          {approval.error !== null && <Notice tone="danger">{approval.error}</Notice>}
          <ClaudePane tabId={tab.id} actions={actions} />
        </div>
      </div>
      {approval.dialog !== null && (
        <ConfirmDialog
          title={approval.dialog.title}
          body={approval.dialog.body}
          confirmLabel="Approve anyway"
          danger
          onConfirm={approval.confirm}
          onCancel={approval.cancel}
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
