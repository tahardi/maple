import { useEffect } from 'react';
import styles from './App.module.css';
import { Banner } from './shell/Banner';
import { TabBar } from './shell/TabBar';
import { useMaple } from './store';

const RELOAD_HINT = 'Fix ~/.config/maple/config.json, then Reload config (Ctrl+Shift+R)';

export function App() {
  const init = useMaple((s) => s.init);
  const configError = useMaple((s) => s.config?.error ?? null);
  const problems = useMaple((s) => s.problems);
  const project = useMaple((s) => s.config?.data?.projects.find((p) => p.jiraKey === s.projectKey));
  const activeTab = useMaple((s) => s.tabs.find((t) => t.id === s.activeTabId));

  useEffect(() => {
    void init();
  }, [init]);

  const messages = [...problems.map((p) => p.message), ...(configError === null ? [] : [configError, RELOAD_HINT])];

  return (
    <div className={styles.app}>
      {messages.length > 0 && <Banner messages={messages} />}
      <TabBar />
      {activeTab ? (
        <div data-testid="card-tab">{activeTab.cardKey}</div>
      ) : (
        <div data-testid="home">{project?.name}</div>
      )}
    </div>
  );
}
