import type { ProjectConfig } from '@shared/types/config';
import { projectCounts } from '@shared/dots';
import { useCallback, useRef, useState } from 'react';
import { useMaple } from '../store';
import styles from './ProjectMenu.module.css';
import { useDismiss } from './useDismiss';

export function ProjectMenu() {
  const projects = useMaple((s) => s.config?.data?.projects);
  const projectKey = useMaple((s) => s.projectKey);
  const selectProject = useMaple((s) => s.selectProject);
  const tabs = useMaple((s) => s.tabs);
  const statuses = useMaple((s) => s.statuses);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useDismiss(root, open, close);
  const counts = projectCounts(tabs, Object.values(statuses));
  const label = (p: ProjectConfig) => {
    const base = `${p.name} (${p.jiraKey})`;
    if (!Object.hasOwn(counts, p.jiraKey)) {
      return base;
    }
    const { waiting, ready } = counts[p.jiraKey];
    return waiting + ready === 0 ? base : `${base} · ${String(waiting)} waiting · ${String(ready)} ready`;
  };

  const selected = projects?.find((p) => p.jiraKey === projectKey);

  return (
    <div ref={root} className={styles.project}>
      <button
        className={styles.button}
        aria-label="Project"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {selected && label(selected)} ▾
      </button>
      {open && (
        <div role="menu" className={styles.panel}>
          {(projects ?? []).map((p) => (
            <button
              key={p.jiraKey}
              role="menuitemradio"
              aria-checked={p.jiraKey === projectKey}
              className={styles.row}
              onClick={() => {
                close();
                selectProject(p.jiraKey);
              }}
            >
              {label(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
