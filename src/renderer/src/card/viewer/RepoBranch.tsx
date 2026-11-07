import type { RepoInfo } from '@shared/types/files';
import styles from './RepoBranch.module.css';

export function RepoBranch({ repo }: { repo: RepoInfo }) {
  return (
    <dl className={styles.repo} data-testid="repo-branch">
      <div className={styles.field}>
        <dt>Repo</dt>
        <dd title={repo.name}>{repo.name}</dd>
      </div>
      <div className={styles.field}>
        <dt>Branch</dt>
        <dd className={styles.branch} title={repo.branch}>
          {repo.branch}
        </dd>
      </div>
    </dl>
  );
}
