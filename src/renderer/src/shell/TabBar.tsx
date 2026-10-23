import { useState } from 'react';
import { useMaple } from '../store';
import { ConfirmDialog } from './ConfirmDialog';
import { Inbox } from './Inbox';
import { ProjectMenu } from './ProjectMenu';
import { ReportDialog } from './ReportDialog';
import styles from './TabBar.module.css';
import { tabLabel } from './tabLabel';

export function TabBar() {
  const tabs = useMaple((s) => s.tabs);
  const projectKey = useMaple((s) => s.projectKey);
  const activeTabId = useMaple((s) => s.activeTabId);
  const activate = useMaple((s) => s.activate);
  const statuses = useMaple((s) => s.statuses);
  const confirmClose = useMaple((s) => s.confirmClose);
  const closeTab = useMaple((s) => s.closeTab);
  const cancelClose = useMaple((s) => s.cancelClose);
  const vaultDir = useMaple((s) => s.config?.data?.vaultDir ?? null);
  const [reporting, setReporting] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const cardTabs = tabs.filter((t) => t.projectKey === projectKey && t.kind === 'card');
  const vaultTab = tabs.find((t) => t.projectKey === projectKey && t.kind === 'vault');
  const dotOf = (id: string) => (Object.hasOwn(statuses, id) ? statuses[id].dot : undefined);
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
        const message = err instanceof Error ? err.message : String(err);
        setVaultError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      },
    );
  };
  const items = [
    {
      key: 'home',
      id: null,
      label: 'Home',
      dot: undefined,
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
            id: vaultTab?.id ?? null,
            label: 'Vault',
            dot: vaultTab && dotOf(vaultTab.id),
            selected: vaultTab !== undefined && vaultTab.id === activeTabId,
            onClick: openVault,
          },
        ]),
    ...cardTabs.map((t) => ({
      key: t.id,
      id: t.id,
      label: t.cardKey ?? t.id,
      dot: dotOf(t.id),
      selected: t.id === activeTabId,
      onClick: () => {
        activate(t.id);
      },
    })),
  ];
  const closing = tabs.find((t) => t.id === confirmClose);

  return (
    <div className={styles.bar}>
      <Inbox />
      <ProjectMenu />
      <div role="tablist" className={styles.tabs}>
        {items.map(({ id, ...item }) => (
          <div key={item.key} className={item.selected ? `${styles.item} ${styles.active}` : styles.item}>
            <button role="tab" aria-selected={item.selected} className={styles.tab} onClick={item.onClick}>
              {item.dot && <span className={styles.dot} data-dot={item.dot} />}
              {item.label}
            </button>
            {id !== null && (
              <button
                className={styles.close}
                aria-label={`Close ${item.label}`}
                onClick={() => void closeTab(id, false)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {vaultError !== null && (
        <div className={styles.error} role="alert">
          {vaultError}
        </div>
      )}
      <button
        className={styles.report}
        onClick={() => {
          setReporting(true);
        }}
      >
        Report
      </button>
      {reporting && (
        <ReportDialog
          onClose={() => {
            setReporting(false);
          }}
        />
      )}
      {closing && (
        <ConfirmDialog
          title="Close tab"
          body={`${tabLabel(closing)} is still working. Close anyway?`}
          confirmLabel="Close"
          onConfirm={() => void closeTab(closing.id, true)}
          onCancel={cancelClose}
        />
      )}
    </div>
  );
}
