import { useEffect } from 'react';
import styles from './App.module.css';
import { CardTab } from './card/CardTab';
import { HomeTab } from './home/HomeTab';
import { Banner } from './shell/Banner';
import { QuitGuard } from './shell/QuitGuard';
import { TabBar } from './shell/TabBar';
import { useMaple } from './store';

const RELOAD_HINT = 'Fix ~/.config/maple/config.json, then Reload config (Ctrl+Shift+R)';

export function App() {
  const init = useMaple((s) => s.init);
  const configError = useMaple((s) => s.config?.error ?? null);
  const problems = useMaple((s) => s.problems);
  const warnings = useMaple((s) => s.warnings);
  const projectKey = useMaple((s) => s.projectKey);
  const activeTab = useMaple((s) => s.tabs.find((t) => t.id === s.activeTabId));

  useEffect(() => {
    void init();
  }, [init]);

  const messages = [
    ...problems.map((p) => p.message),
    ...warnings,
    ...(configError === null ? [] : [configError, RELOAD_HINT]),
  ];

  return (
    <div className={styles.app}>
      {messages.length > 0 && <Banner messages={messages} />}
      <TabBar />
      {activeTab ? (
        <CardTab key={activeTab.id} tab={activeTab} />
      ) : (
        projectKey !== null && <HomeTab key={projectKey} projectKey={projectKey} />
      )}
      <QuitGuard />
    </div>
  );
}
