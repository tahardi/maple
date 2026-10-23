import { useEffect, useState } from 'react';
import styles from './App.module.css';
import { CardTab } from './card/CardTab';
import { HomeTab } from './home/HomeTab';
import { VaultTab } from './vault/VaultTab';
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
  const tabs = useMaple((s) => s.tabs);
  const activeTabId = useMaple((s) => s.activeTabId);
  const [visited, setVisited] = useState<readonly string[]>([]);

  if (projectKey !== null && !visited.includes(projectKey)) {
    setVisited([...visited, projectKey]);
  }

  useEffect(() => {
    void init();
  }, [init]);

  const cardTabs = tabs.filter((t) => t.kind === 'card');
  const vaultTabs = tabs.filter((t) => t.kind === 'vault');
  const tabActive = [...cardTabs, ...vaultTabs].some((t) => t.id === activeTabId);

  const messages = [
    ...problems.map((p) => p.message),
    ...warnings,
    ...(configError === null ? [] : [configError, RELOAD_HINT]),
  ];

  return (
    <div className={styles.app}>
      {messages.length > 0 && <Banner messages={messages} />}
      <TabBar />
      {cardTabs.map((tab) => (
        <div key={tab.id} className={styles.slot} hidden={tab.id !== activeTabId}>
          <CardTab tab={tab} />
        </div>
      ))}
      {vaultTabs.map((tab) => (
        <div key={tab.id} className={styles.slot} hidden={tab.id !== activeTabId}>
          <VaultTab tab={tab} />
        </div>
      ))}
      {visited.map((key) => (
        <div key={key} className={styles.slot} hidden={key !== projectKey || tabActive}>
          <HomeTab projectKey={key} />
        </div>
      ))}
      <QuitGuard />
    </div>
  );
}
