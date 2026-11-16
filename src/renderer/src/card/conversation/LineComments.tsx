import { threadLabel } from '@renderer/card/comments/threadLabel';
import type { FileThreads } from './threadsByFile';
import styles from './LineComments.module.css';

type Props = {
  threads: { open: readonly FileThreads[]; resolved: readonly FileThreads[] };
  onOpen: (path: string, line: number) => void;
};

const replies = (n: number) => (n === 1 ? '1 reply' : `${String(n)} replies`);

const count = (groups: readonly FileThreads[]) => groups.reduce((n, g) => n + g.threads.length, 0);

export function LineComments({ threads, onOpen }: Props) {
  const list = (groups: readonly FileThreads[]) =>
    groups.map((g) => (
      <section key={g.path} className={styles.file}>
        <h4 className={styles.path}>{g.path}</h4>
        {g.threads.map((t) => (
          <button
            key={t.id}
            className={styles.entry}
            onClick={() => {
              onOpen(g.path, t.line);
            }}
          >
            <span className={styles.meta}>
              <span className={styles.line}>{threadLabel(t)}</span>
              <span>{t.comments[0]?.author}</span>
              <span>{replies(t.comments.length - 1)}</span>
            </span>
            <span className={styles.snippet}>{t.comments[0]?.body}</span>
          </button>
        ))}
      </section>
    ));
  const resolved = count(threads.resolved);

  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Line comments</h3>
      {threads.open.length === 0 && resolved === 0 && <p className={styles.empty}>No line comments</p>}
      {list(threads.open)}
      {resolved > 0 && (
        <details>
          <summary className={styles.summary}>{`Resolved (${String(resolved)})`}</summary>
          {list(threads.resolved)}
        </details>
      )}
    </div>
  );
}
