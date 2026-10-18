import { useMaple } from '../store';
import styles from './ProjectMenu.module.css';

export function ProjectMenu() {
  const projects = useMaple((s) => s.config?.data?.projects);
  const projectKey = useMaple((s) => s.projectKey);
  const selectProject = useMaple((s) => s.selectProject);

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
          {`${p.name} (${p.jiraKey})`}
        </option>
      ))}
    </select>
  );
}
