import { useEffect, useId, useState } from 'react';
import type { Filed, Report } from '@shared/types/jira';
import styles from './ReportDialog.module.css';

type ReportDialogProps = { onClose: () => void };

export function ReportDialog({ onClose }: ReportDialogProps) {
  const titleId = useId();
  const [kind, setKind] = useState<Report['kind']>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [filed, setFiled] = useState<Filed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      setFiled(await window.maple.jira.report({ kind, title, description }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h2 id={titleId}>Report a bug or feature</h2>
        {filed ? (
          <>
            <p>
              <a href={filed.url} target="_blank" rel="noreferrer">{`Filed ${filed.key}`}</a>
            </p>
            <div className={styles.buttons}>
              <button onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className={styles.kinds}>
              {(['bug', 'feature'] as const).map((k) => (
                <label key={k}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === k}
                    onChange={() => {
                      setKind(k);
                    }}
                  />
                  {k === 'bug' ? 'Bug' : 'Feature'}
                </label>
              ))}
            </div>
            <label>
              Title
              <input
                value={title}
                maxLength={255}
                autoFocus
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                maxLength={10_000}
                rows={6}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
              />
            </label>
            {kind === 'bug' && <p className={styles.note}>The recent log will be attached, with secrets removed.</p>}
            {error && <p role="alert">{error}</p>}
            <div className={styles.buttons}>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={sending || title.trim() === ''}>
                Submit
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
