import styles from './TabBar.module.css';
import { useUsage } from './useUsage';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function time(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function UsageMeter() {
  const usage = useUsage();
  const windows = [
    { label: '5h', usageWindow: usage?.fiveHour, resets: (d: Date) => time(d) },
    { label: '7d', usageWindow: usage?.sevenDay, resets: (d: Date) => `${DAYS[d.getDay()]} ${time(d)}` },
  ].flatMap(({ label, usageWindow, resets }) => (usageWindow ? [{ label, resets, ...usageWindow }] : []));

  if (windows.length === 0) {
    return null;
  }
  return (
    <div
      className={styles.usage}
      title={windows.map((w) => `${w.label} resets ${w.resets(new Date(w.resetsAt * 1000))}`).join(' · ')}
    >
      {windows.map((w, i) => (
        <span key={w.label}>
          {i > 0 && ' · '}
          <span className={w.usedPercentage >= 80 ? styles.warning : undefined}>
            {w.label} {Math.round(w.usedPercentage)}%
          </span>
        </span>
      ))}
    </div>
  );
}
