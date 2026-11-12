import { useState } from 'react';
import { CommentEditor } from './CommentEditor';
import styles from './LineComment.module.css';
import { errorText } from '@shared/errors/errorText';

type Props = {
  tabId: string;
  path: string;
  startLine: number | null;
  line: number;
  headSha: string;
  onDone: () => void;
};

export function LineComment({ tabId, path, startLine, line, headSha, onDone }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = () => {
    setPosting(true);
    setError(null);
    window.maple.pr.comment(tabId, path, startLine, line, text, headSha).then(onDone, (err: unknown) => {
      setError(errorText(err));
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
