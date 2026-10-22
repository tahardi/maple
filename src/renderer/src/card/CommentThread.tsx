import { useState } from 'react';
import { MarkdownText } from '../shell/MarkdownText';
import styles from './CommentThread.module.css';
import type { Thread } from './commentThreads';

type Props = {
  tabId: string;
  thread: Thread;
  onPosted: () => void;
};

function label(thread: Thread): string {
  return thread.startLine === null
    ? `Line ${String(thread.line)}`
    : `Lines ${String(thread.startLine)}-${String(thread.line)}`;
}

export function CommentThread({ tabId, thread, onPosted }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = () => {
    setPosting(true);
    setError(null);
    window.maple.pr.reply(tabId, thread.id, text).then(
      () => {
        setText('');
        setPosting(false);
        onPosted();
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
        setPosting(false);
      },
    );
  };

  return (
    <div className={styles.thread}>
      <div className={styles.label}>{label(thread)}</div>
      {thread.comments.map((c) => (
        <div key={c.id} className={styles.comment}>
          <div className={styles.author}>{c.author}</div>
          <MarkdownText text={c.body} />
        </div>
      ))}
      <div className={styles.reply}>
        <textarea
          aria-label="Reply"
          placeholder="Reply"
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
        <div>
          <button disabled={posting || text.trim() === ''} onClick={post}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
