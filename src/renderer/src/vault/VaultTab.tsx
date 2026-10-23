import type { TabState } from '@shared/types/tabs';
import { useState } from 'react';
import { ClaudePane } from '@renderer/claude/ClaudePane';
import { buildTree } from '@renderer/card/viewer/buildTree';
import { FileTree } from '@renderer/card/viewer/FileTree';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { useVault } from '@renderer/card/vault/useVault';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { writtenNotes } from '@renderer/card/vault/writtenNotes';
import styles from './VaultTab.module.css';

export function VaultTab({ tab }: { tab: TabState }) {
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [changedOnly, setChangedOnly] = useState(false);
  const vault = useVault(tab.id, true);
  const recent = writtenNotes(vault.notes, vault.written);

  const openNote = (path: string) => {
    const file = `${VAULT_PREFIX}${path}`;
    setOpenFiles((files) => (files.includes(file) ? files : [...files, file]));
    setActiveFile(file);
  };

  const closeFile = (path: string) => {
    const rest = openFiles.filter((file) => file !== path);
    setOpenFiles(rest);
    if (path === activeFile) {
      setActiveFile(rest.at(-1) ?? null);
    }
  };

  return (
    <div className={styles.tab} data-testid="vault-tab">
      <div className={styles.left}>
        <FileTree
          key={changedOnly ? 'changed' : 'all'}
          nodes={buildTree(
            vault.notes.map((note) => note.path),
            recent,
            changedOnly,
          )}
          selected={activeFile?.startsWith(VAULT_PREFIX) ? activeFile.slice(VAULT_PREFIX.length) : null}
          onSelect={openNote}
          changedOnly={changedOnly}
          onToggle={setChangedOnly}
          changedCount={recent.length}
          collapsedByDefault={!changedOnly}
        />
      </div>
      <div className={styles.middle}>
        <FileViewer
          tabId={tab.id}
          openFiles={openFiles}
          activeFile={activeFile}
          onActivate={setActiveFile}
          onCloseFile={closeFile}
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
