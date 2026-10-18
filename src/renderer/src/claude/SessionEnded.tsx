import styles from './SessionEnded.module.css';

type SessionEndedProps = { tabId: string; exitCode: number | null };

export function SessionEnded({ tabId, exitCode }: SessionEndedProps) {
  return (
    <div className={styles.overlay}>
      <p>Session ended (exit code {exitCode ?? 'unknown'})</p>
      <div className={styles.buttons}>
        <button onClick={() => void window.maple.tabs.resume(tabId)}>Resume</button>
        <button onClick={() => void window.maple.tabs.startFresh(tabId)}>Start fresh</button>
      </div>
    </div>
  );
}
