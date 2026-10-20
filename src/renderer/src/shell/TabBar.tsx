import { useState } from 'react';
import { useMaple } from '../store';
import { ConfirmDialog } from './ConfirmDialog';
import { Inbox } from './Inbox';
import { ProjectMenu } from './ProjectMenu';
import { ReportDialog } from './ReportDialog';
import styles from './TabBar.module.css';

export function TabBar() {
  const tabs = useMaple((s) => s.tabs);
  const projectKey = useMaple((s) => s.projectKey);
  const activeTabId = useMaple((s) => s.activeTabId);
  const activate = useMaple((s) => s.activate);
  const statuses = useMaple((s) => s.statuses);
  const confirmClose = useMaple((s) => s.confirmClose);
  const closeTab = useMaple((s) => s.closeTab);
  const cancelClose = useMaple((s) => s.cancelClose);
  const [reporting, setReporting] = useState(false);
  const cardTabs = tabs.filter((t) => t.projectKey === projectKey && t.kind === 'card');
  const items = [
    { id: null, label: 'Home', dot: undefined },
    ...cardTabs.map((t) => ({
      id: t.id,
      label: t.cardKey ?? t.id,
      dot: Object.hasOwn(statuses, t.id) ? statuses[t.id].dot : undefined,
    })),
  ];
  const closing = tabs.find((t) => t.id === confirmClose);

  return (
    <div className={styles.bar}>
      <Inbox />
      <ProjectMenu />
      <div role="tablist" className={styles.tabs}>
        {items.map((item) => (
          <div
            key={item.id ?? 'home'}
            className={item.id === activeTabId ? `${styles.item} ${styles.active}` : styles.item}
          >
            <button
              role="tab"
              aria-selected={item.id === activeTabId}
              className={styles.tab}
              onClick={() => {
                activate(item.id);
              }}
            >
              {item.dot && <span className={styles.dot} data-dot={item.dot} />}
              {item.label}
            </button>
            {item.id !== null && (
              <button
                className={styles.close}
                aria-label={`Close ${item.label}`}
                onClick={() => void closeTab(item.id, false)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
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
          body={`${closing.cardKey ?? closing.id} is still working. Close anyway?`}
          confirmLabel="Close"
          onConfirm={() => void closeTab(closing.id, true)}
          onCancel={cancelClose}
        />
      )}
    </div>
  );
}
