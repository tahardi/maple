import { useState } from 'react';
import { useMaple } from '@renderer/store';
import { ConfirmDialog } from '@renderer/shell/ConfirmDialog';
import { Inbox } from '@renderer/shell/Inbox';
import { ProjectMenu } from '@renderer/shell/ProjectMenu';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './TabBar.module.css';
import { tabLabel } from './tabLabel';
import { useTabKeys } from './useTabKeys';
import { errorText } from '@shared/errors/errorText';
import { DOT_LABELS } from '@shared/status/dots';

const SYNC_LABELS = { queued: 'Sync queued', syncing: 'Syncing with main' } as const;

export function TabBar() {
  useTabKeys();
  const tabs = useMaple((s) => s.tabs);
  const projectKey = useMaple((s) => s.projectKey);
  const activeTabId = useMaple((s) => s.activeTabId);
  const activate = useMaple((s) => s.activate);
  const statuses = useMaple((s) => s.statuses);
  const confirmClose = useMaple((s) => s.confirmClose);
  const closeTab = useMaple((s) => s.closeTab);
  const cancelClose = useMaple((s) => s.cancelClose);
  const vaultDir = useMaple((s) => s.config?.data?.vaultDir ?? null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const cardTabs = tabs.filter((t) => t.projectKey === projectKey && t.kind === 'card');
  const vaultTab = tabs.find((t) => t.projectKey === projectKey && t.kind === 'vault');
  const dotOf = (id: string) => (Object.hasOwn(statuses, id) ? statuses[id].dot : undefined);
  const syncOf = (id: string) => (Object.hasOwn(statuses, id) ? statuses[id].sync : null);
  const openVault = () => {
    setVaultError(null);
    if (vaultTab) {
      activate(vaultTab.id);
      return;
    }
    if (projectKey === null) {
      return;
    }
    window.maple.tabs.openVault(projectKey).then(
      (tab) => {
        activate(tab.id);
      },
      (err: unknown) => {
        setVaultError(errorText(err));
      },
    );
  };
  const pinned = [
    {
      key: 'home',
      id: null,
      label: 'Home',
      dot: undefined,
      sync: null,
      selected: activeTabId === null,
      onClick: () => {
        activate(null);
      },
    },
    ...(vaultDir === null
      ? []
      : [
          {
            key: 'vault',
            id: null,
            label: 'Vault',
            dot: undefined,
            sync: null,
            selected: vaultTab !== undefined && vaultTab.id === activeTabId,
            onClick: openVault,
          },
        ]),
  ];
  const cardItems = cardTabs.map((t) => ({
    key: t.id,
    id: t.id,
    label: t.cardKey ?? t.id,
    dot: dotOf(t.id),
    sync: syncOf(t.id),
    selected: t.id === activeTabId,
    onClick: () => {
      activate(t.id);
    },
  }));
  const renderItem = ({ id, ...item }: (typeof pinned)[number] | (typeof cardItems)[number]) => (
    <div key={item.key} className={item.selected ? `${styles.item} ${styles.active}` : styles.item}>
      <button role="tab" aria-selected={item.selected} className={styles.tab} onClick={item.onClick}>
        {item.dot && <span role="img" className={styles.dot} data-dot={item.dot} aria-label={DOT_LABELS[item.dot]} />}
        {item.label}
        {item.sync !== null && (
          <span
            className={styles.sync}
            data-sync={item.sync}
            aria-label={SYNC_LABELS[item.sync]}
            title={SYNC_LABELS[item.sync]}
          >
            ↻
          </span>
        )}
      </button>
      {id !== null && (
        <button
          className={styles.close}
          aria-label={`Close ${item.label}`}
          title="Close (Ctrl+Shift+W)"
          aria-keyshortcuts="Control+Shift+W"
          onClick={() => void closeTab(id, false)}
        >
          ×
        </button>
      )}
    </div>
  );
  const closing = tabs.find((t) => t.id === confirmClose);

  return (
    <div className={styles.bar}>
      <Inbox />
      <ProjectMenu />
      <div role="tablist" className={styles.tabs}>
        {pinned.map(renderItem)}
        <div className={styles.divider} aria-hidden="true" data-testid="pinned-divider" />
        {cardItems.map(renderItem)}
      </div>
      {vaultError !== null && <Notice tone="danger">{vaultError}</Notice>}
      {closing && (
        <ConfirmDialog
          title="Close tab"
          body={`${tabLabel(closing)} is still working. Close anyway?`}
          confirmLabel="Close"
          danger
          onConfirm={() => void closeTab(closing.id, true)}
          onCancel={cancelClose}
        />
      )}
    </div>
  );
}
