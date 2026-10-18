import type { ProjectConfig } from '@shared/types';
import { projectCounts } from '@shared/dots';
import { useMaple } from '../store';
import styles from './ProjectMenu.module.css';

export function ProjectMenu() {
  const projects = useMaple((s) => s.config?.data?.projects);
  const projectKey = useMaple((s) => s.projectKey);
  const selectProject = useMaple((s) => s.selectProject);
  const tabs = useMaple((s) => s.tabs);
  const statuses = useMaple((s) => s.statuses);
  const counts = projectCounts(tabs, Object.values(statuses));
  const label = (p: ProjectConfig) => {
    const base = `${p.name} (${p.jiraKey})`;
    if (!Object.hasOwn(counts, p.jiraKey)) {
      return base;
    }
    const { waiting, ready } = counts[p.jiraKey];
    return waiting + ready === 0 ? base : `${base} · ${String(waiting)} waiting · ${String(ready)} ready`;
  };

  return (
    <select
      className={styles.menu}
      aria-label="Project"
      value={projectKey ?? ''}
      onChange={(e) => {
        selectProject(e.target.value);
      }}
    >
      {(projects ?? []).map((p) => (
        <option key={p.jiraKey} value={p.jiraKey}>
          {label(p)}
        </option>
      ))}
    </select>
  );
}
