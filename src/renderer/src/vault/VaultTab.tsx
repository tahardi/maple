import type { TabState } from '@shared/types/tabs';
import { useState } from 'react';
import { ClaudePane } from '@renderer/claude/ClaudePane';
import { buildTree } from '@renderer/card/viewer/tree/buildTree';
import { closeFiles } from '@renderer/card/viewer/tabs/closeFiles';
import { FileTree } from '@renderer/card/viewer/tree/FileTree';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { useVault } from '@renderer/card/vault/useVault';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import styles from './VaultTab.module.css';

export function VaultTab({ tab }: { tab: TabState }) {
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const vault = useVault(tab.id, true);

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
    <div className={styles.tab} data-testid="vault-tab">
      <div className={styles.left}>
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
      <div className={styles.right} data-testid="claude-slot">
        <ClaudePane tabId={tab.id} actions={[]} />
      </div>
    </div>
  );
}
