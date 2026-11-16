import { errorText } from '@shared/errors/errorText';
import type { Draft } from '@shared/types/files/draft';
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
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { SplitHandle } from '@renderer/shell/split/SplitHandle';
import { splitSize } from '@renderer/shell/split/splitSize';
import { useColumnDrag } from '@renderer/shell/split/useColumnDrag';
import { NameBox } from './NameBox';
import { NoteMenu } from './NoteMenu';
import styles from './VaultTab.module.css';

const NO_DRAFTS: Record<string, Draft> = {};

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function inFolder(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

export function VaultTab({ tab }: { tab: TabState }) {
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const vault = useVault(tab.id, true);
  const vaultDir = useMaple((s) => s.config?.data?.vaultDir ?? null);
  const drafts = useMaple((s) => (Object.hasOwn(s.drafts, tab.id) ? s.drafts[tab.id] : NO_DRAFTS));
  const [folder, setFolder] = useState('');
  const [naming, setNaming] = useState<'note' | 'folder' | null>(null);
  const [busy, setBusy] = useState(false);
  const [madeFolders, setMadeFolders] = useState<readonly string[]>([]);
  const [editFile, setEditFile] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const selectNote = (path: string) => {
    setFolder(parentOf(path));
    openNote(path);
  };

  const create = (name: string) => {
    const kind = naming;
    if (kind === null) {
      return;
    }
    const path = inFolder(folder, kind === 'note' && !name.endsWith('.md') ? `${name}.md` : name);
    setBusy(true);
    const made = kind === 'note' ? window.maple.vault.createNote(path) : window.maple.vault.createFolder(path);
    made.then(
      () => {
        setBusy(false);
        setNaming(null);
        setError(null);
        vault.refresh();
        if (kind === 'note') {
          setEditFile(`${VAULT_PREFIX}${path}`);
          openNote(path);
        } else {
          setMadeFolders((folders) => [...folders, path]);
        }
      },
      (err: unknown) => {
        setBusy(false);
        setError(errorText(err));
      },
    );
  };

  const trash = (path: string) => {
    setMenu(null);
    window.maple.vault.trash(path).then(
      () => {
        closeTabs([`${VAULT_PREFIX}${path}`]);
        vault.refresh();
      },
      (err: unknown) => {
        setError(errorText(err));
      },
    );
  };

  const nameBox =
    naming === null
      ? undefined
      : {
          folder,
          box: (
            <NameBox
              key={naming}
              label={naming === 'note' ? 'New note name' : 'New folder name'}
              busy={busy}
              onSubmit={create}
              onCancel={() => {
                setNaming(null);
              }}
            />
          ),
        };

  return (
    <div ref={body} className={styles.tab} data-testid="vault-tab">
      <div className={styles.left} style={{ width: left.size }} data-testid="tree-slot">
        <div className={styles.heading}>
          {vaultDir !== null && (
            <h2 className={styles.vaultName} title={vaultDir}>
              {folderName(vaultDir)}
            </h2>
          )}
          <div className={styles.actions}>
            <Button
              label="+ Note"
              onClick={() => {
                setNaming('note');
              }}
            />
            <Button
              label="+ Folder"
              onClick={() => {
                setNaming('folder');
              }}
            />
          </div>
        </div>
        {error !== null && (
          <Notice
            tone="danger"
            onDismiss={() => {
              setError(null);
            }}
          >
            {error}
          </Notice>
        )}
        <FileTree
          nodes={buildTree([...vault.notes.map((note) => note.path), ...madeFolders.map((f) => `${f}/`)], [], false)}
          selected={activeFile?.startsWith(VAULT_PREFIX) ? activeFile.slice(VAULT_PREFIX.length) : null}
          onSelect={selectNote}
          onSelectFolder={setFolder}
          onFileMenu={(path, x, y) => {
            setMenu({ path, x, y });
          }}
          nameBox={nameBox}
          collapsedByDefault
        />
        {menu !== null && (
          <NoteMenu
            x={menu.x}
            y={menu.y}
            unsaved={Object.hasOwn(drafts, `${VAULT_PREFIX}${menu.path}`)}
            onTrash={() => {
              trash(menu.path);
            }}
            onDismiss={() => {
              setMenu(null);
            }}
          />
        )}
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
          editFile={editFile}
        />
      </div>
      <SplitHandle drag={right} axis="x" label="Resize Claude pane" />
      <div className={styles.right} style={{ width: `${String(right.size)}%` }} data-testid="claude-slot">
        <ClaudePane tabId={tab.id} actions={[]} />
      </div>
    </div>
  );
}
