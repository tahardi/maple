import { useState } from 'react';
import styles from './LineComment.module.css';

type Props = {
  tabId: string;
  path: string;
  line: number;
  onDone: () => void;
};

export function LineComment({ tabId, path, line, onDone }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = () => {
    setPosting(true);
    setError(null);
    window.maple.pr.comment(tabId, path, line, text).then(onDone, (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
      setPosting(false);
    });
  };

  return (
    <div className={styles.form}>
      <h3 className={styles.heading}>{`Comment on ${path}:${String(line)}`}</h3>
      <textarea
        className={styles.text}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      {error !== null && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <button disabled={posting || text.trim() === ''} onClick={post}>
          Post
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
