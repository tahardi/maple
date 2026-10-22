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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  const send = (request: Promise<void>, onDone: () => void) => {
    setBusy(true);
    setError(null);
    request.then(
      () => {
        setBusy(false);
        onDone();
        onPosted();
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
        setBusy(false);
      },
    );
  };

  const post = () => {
    send(window.maple.pr.reply(tabId, thread.id, text), () => {
      setText('');
    });
  };

  const { threadId } = thread;
  const open = !thread.resolved;

  return (
    <div className={styles.thread}>
      <div className={styles.label}>
        <span>{label(thread)}</span>
        {!open && (
          <>
            <span className={styles.resolved}>Resolved</span>
            <button
              onClick={() => {
                setShown(!shown);
              }}
            >
              {shown ? 'Hide' : 'Show'}
            </button>
          </>
        )}
      </div>
      {(open || shown) &&
        thread.comments.map((c) => (
          <div key={c.id} className={styles.comment}>
            <div className={styles.author}>{c.author}</div>
            <MarkdownText text={c.body} />
          </div>
        ))}
      {open && (
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
          <div className={styles.actions}>
            <button disabled={busy || text.trim() === ''} onClick={post}>
              Post
            </button>
            {threadId !== null && (
              <button
                disabled={busy}
                onClick={() => {
                  send(window.maple.pr.resolve(tabId, threadId, true), () => undefined);
                }}
              >
                Resolve
              </button>
            )}
          </div>
        </div>
      )}
      {!open && shown && threadId !== null && (
        <div className={styles.reply}>
          {error !== null && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          <div className={styles.actions}>
            <button
              disabled={busy}
              onClick={() => {
                send(window.maple.pr.resolve(tabId, threadId, false), () => undefined);
              }}
            >
              Unresolve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
