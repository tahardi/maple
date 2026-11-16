import type { PrComment } from '@shared/types/github/prComment';
import { useState } from 'react';
import { MarkdownText } from '@renderer/shell/markdown/MarkdownText';
import { Button } from '@renderer/shell/blocks/Button';
import { Notice } from '@renderer/shell/blocks/Notice';
import { CommentEditor } from '@renderer/card/comments/CommentEditor';
import { errorText } from '@shared/errors/errorText';
import styles from './CommentsView.module.css';

type Props = {
  tabId: string;
  comments: readonly PrComment[];
  canPost: boolean;
  onPosted: () => void;
};

const when = (at: string) =>
  new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function CommentsView({ tabId, comments, canPost, onPosted }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState(0);

  const post = () => {
    setPosting(true);
    setError(null);
    window.maple.pr.commentOnPr(tabId, text).then(
      () => {
        setPosting(false);
        setText('');
        setPosts(posts + 1);
        onPosted();
      },
      (err: unknown) => {
        setError(errorText(err));
        setPosting(false);
      },
    );
  };

  return (
    <div className={styles.view}>
      <h3 className={styles.heading}>Conversation</h3>
      {comments.length === 0 && <p className={styles.empty}>No comments yet</p>}
      {comments.map((c) => (
        <article key={c.url} className={styles.comment}>
          <div className={styles.meta}>
            <span className={styles.author}>{c.author}</span>
            <time dateTime={c.at}>{when(c.at)}</time>
          </div>
          <MarkdownText text={c.body} />
        </article>
      ))}
      {canPost && (
        <div className={styles.post}>
          <CommentEditor key={posts} label="Comment on the PR" value={text} onChange={setText} />
          {error !== null && <Notice tone="danger">{error}</Notice>}
          <div>
            <Button
              label="Post"
              disabled={posting || text.trim() === ''}
              busy={posting}
              busyLabel="Posting…"
              onClick={post}
            />
          </div>
        </div>
      )}
    </div>
  );
}
