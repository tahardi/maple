import { useState } from 'react';
import { CommentEditor } from './CommentEditor';
import styles from './LineComment.module.css';

type Props = {
  tabId: string;
  path: string;
  startLine: number | null;
  line: number;
  onDone: () => void;
};

export function LineComment({ tabId, path, startLine, line, onDone }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = () => {
    setPosting(true);
    setError(null);
    window.maple.pr.comment(tabId, path, startLine, line, text).then(onDone, (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
      setPosting(false);
    });
  };

  return (
    <div className={styles.form}>
      <h3
        className={styles.heading}
      >{`Comment on ${path}:${startLine === null ? '' : `${String(startLine)}-`}${String(line)}`}</h3>
      <CommentEditor label="Comment" value={text} onChange={setText} />
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
