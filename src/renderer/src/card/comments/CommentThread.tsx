import { useState } from 'react';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { Badge } from '@renderer/shell/blocks/Badge';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { CommentEditor } from './CommentEditor';
import styles from './CommentThread.module.css';
import type { Thread } from './commentThreads';
import { errorText } from '@shared/errors/errorText';

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
  const [pending, setPending] = useState<'reply' | 'resolve' | 'unresolve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [posts, setPosts] = useState(0);

  const send = (kind: 'reply' | 'resolve' | 'unresolve', request: Promise<void>, onDone: () => void) => {
    setPending(kind);
    setError(null);
    request.then(
      () => {
        setPending(null);
        onDone();
        onPosted();
      },
      (err: unknown) => {
        setError(errorText(err));
        setPending(null);
      },
    );
  };

  const post = () => {
    send('reply', window.maple.pr.reply(tabId, thread.id, text), () => {
      setText('');
      setPosts(posts + 1);
    });
  };

  const { threadId } = thread;
  const busy = pending !== null;
  const open = !thread.resolved;

  return (
    <div className={styles.thread}>
      <div className={styles.label}>
        <span>{label(thread)}</span>
        {!open && (
          <>
            <Badge tone="success">Resolved</Badge>
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
          <CommentEditor key={posts} label="Reply" value={text} onChange={setText} />
          {error !== null && <Notice tone="danger">{error}</Notice>}
          <div className={styles.actions}>
            <Button
              label="Post"
              disabled={busy || text.trim() === ''}
              busy={pending === 'reply'}
              busyLabel="Posting…"
              onClick={post}
            />
            {threadId !== null && (
              <Button
                label="Resolve"
                disabled={busy}
                busy={pending === 'resolve'}
                busyLabel="Resolving…"
                onClick={() => {
                  send('resolve', window.maple.pr.resolve(tabId, threadId, true), () => undefined);
                }}
              />
            )}
          </div>
        </div>
      )}
      {!open && shown && threadId !== null && (
        <div className={styles.reply}>
          {error !== null && <Notice tone="danger">{error}</Notice>}
          <div className={styles.actions}>
            <Button
              label="Unresolve"
              disabled={busy}
              busy={pending === 'unresolve'}
              busyLabel="Unresolving…"
              onClick={() => {
                send('unresolve', window.maple.pr.resolve(tabId, threadId, false), () => undefined);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
