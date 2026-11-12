import type { TabState } from '@shared/types/tabs/tabState';
import { useRef, useState } from 'react';
import { ClaudePane } from '@renderer/claude/ClaudePane';
import { buildTree } from '@renderer/card/viewer/tree/buildTree';
import { closeFiles } from '@renderer/card/viewer/tabs/closeFiles';
import { FileTree } from '@renderer/card/viewer/tree/FileTree';
import { folderName } from '@renderer/card/viewer/tree/folderName';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { useVault } from '@renderer/card/vault/useVault';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { useMaple } from '@renderer/store';
import { SplitHandle } from '@renderer/shell/split/SplitHandle';
import { splitSize } from '@renderer/shell/split/splitSize';
import { useColumnDrag } from '@renderer/shell/split/useColumnDrag';
import styles from './VaultTab.module.css';

export function VaultTab({ tab }: { tab: TabState }) {
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const vault = useVault(tab.id, true);
  const vaultDir = useMaple((s) => s.config?.data?.vaultDir ?? null);
  const body = useRef<HTMLDivElement>(null);
  const left = useColumnDrag(body, {
    storageKey: 'maple.split.vaultTree',
    initial: 240,
    min: 120,
    max: 480,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'start', unit: 'px', min: 120, max: 480 }),
  });
  const right = useColumnDrag(body, {
    storageKey: 'maple.split.vaultClaude',
    initial: 32,
    min: 10,
    max: 80,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'end', unit: '%', min: 10, max: 80 }),
  });

  const openNote = (path: string) => {
    const file = `${VAULT_PREFIX}${path}`;
    setOpenFiles((files) => (files.includes(file) ? files : [...files, file]));
    setActiveFile(file);
  };

  const closeTabs = (paths: readonly string[]) => {
    const next = closeFiles(openFiles, activeFile, paths);
    setOpenFiles(next.openFiles);
    setActiveFile(next.activeFile);
  };

  return (
    <div ref={body} className={styles.tab} data-testid="vault-tab">
      <div className={styles.left} style={{ width: left.size }} data-testid="tree-slot">
        {vaultDir !== null && (
          <h2 className={styles.vaultName} title={vaultDir}>
            {folderName(vaultDir)}
          </h2>
        )}
        <FileTree
          nodes={buildTree(
            vault.notes.map((note) => note.path),
            [],
            false,
          )}
          selected={activeFile?.startsWith(VAULT_PREFIX) ? activeFile.slice(VAULT_PREFIX.length) : null}
          onSelect={openNote}
          collapsedByDefault
        />
      </div>
      <SplitHandle drag={left} axis="x" label="Resize file tree" />
      <div className={styles.middle}>
        <FileViewer
          tabId={tab.id}
          openFiles={openFiles}
          activeFile={activeFile}
          onActivate={setActiveFile}
          onCloseFiles={closeTabs}
          prBody={null}
          canComment={false}
          prFetchedAt={null}
          line={null}
        />
      </div>
      <SplitHandle drag={right} axis="x" label="Resize Claude pane" />
      <div className={styles.right} style={{ width: `${String(right.size)}%` }} data-testid="claude-slot">
        <ClaudePane tabId={tab.id} actions={[]} />
      </div>
    </div>
  );
}
