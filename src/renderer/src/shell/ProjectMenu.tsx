import type { ProjectConfig } from '@shared/types/config/projectConfig';
import { projectCounts } from '@shared/status/dots';
import { useCallback, useRef, useState } from 'react';
import { useMaple } from '../store';
import styles from './ProjectMenu.module.css';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import { useMenuKeys } from '@renderer/shell/menu/useMenuKeys';

export function ProjectMenu() {
  const projects = useMaple((s) => s.config?.data?.projects);
  const projectKey = useMaple((s) => s.projectKey);
  const selectProject = useMaple((s) => s.selectProject);
  const tabs = useMaple((s) => s.tabs);
  const statuses = useMaple((s) => s.statuses);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useDismiss(root, open, close);
  const onKeyDown = useMenuKeys(menu, open);
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
  const current = selected ? `${selected.name} (${selected.jiraKey})` : 'No project selected';

  return (
    <div ref={root} className={styles.project}>
      <button
        className={styles.button}
        aria-label={`Project: ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={styles.label}>{current}</span>▾
      </button>
      {open &&
        (projects === undefined || projects.length === 0 ? (
          <div className={styles.panel}>
            <p className={styles.empty}>No projects</p>
          </div>
        ) : (
          <div ref={menu} role="menu" className={styles.panel} onKeyDown={onKeyDown}>
            {projects.map((p) => (
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
        ))}
    </div>
  );
}
