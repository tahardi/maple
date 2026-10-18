import { useMaple } from '../store';
import { ProjectMenu } from './ProjectMenu';
import styles from './TabBar.module.css';

export function TabBar() {
  const tabs = useMaple((s) => s.tabs);
  const projectKey = useMaple((s) => s.projectKey);
  const activeTabId = useMaple((s) => s.activeTabId);
  const activate = useMaple((s) => s.activate);
  const statuses = useMaple((s) => s.statuses);
  const cardTabs = tabs.filter((t) => t.projectKey === projectKey && t.kind === 'card');
  const items = [
    { id: null, label: 'Home', dot: undefined },
    ...cardTabs.map((t) => ({
      id: t.id,
      label: t.cardKey ?? t.id,
      dot: Object.hasOwn(statuses, t.id) ? statuses[t.id].dot : undefined,
    })),
  ];

  return (
    <div className={styles.bar}>
      <ProjectMenu />
      <div role="tablist" className={styles.tabs}>
        {items.map((item) => (
          <button
            key={item.id ?? 'home'}
            role="tab"
            aria-selected={item.id === activeTabId}
            className={item.id === activeTabId ? `${styles.tab} ${styles.active}` : styles.tab}
            onClick={() => {
              activate(item.id);
            }}
          >
            {item.dot && <span className={styles.dot} data-dot={item.dot} />}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
