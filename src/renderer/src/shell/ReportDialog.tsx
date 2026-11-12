import { useState } from 'react';
import type { Filed } from '@shared/types/jira/filed';
import type { Report } from '@shared/types/jira/report';
import styles from './ReportDialog.module.css';
import { Button } from './blocks/Button';
import { Dialog } from './blocks/Dialog';
import { Notice } from './blocks/Notice';
import { errorText } from '@shared/errors/errorText';

type ReportDialogProps = { onClose: () => void };

export function ReportDialog({ onClose }: ReportDialogProps) {
  const [kind, setKind] = useState<Report['kind']>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [filed, setFiled] = useState<Filed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      setFiled(await window.maple.jira.report({ kind, title, description }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog title="Report a bug or feature" onClose={onClose}>
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
              data-autofocus
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
          {error && <Notice tone="danger">{error}</Notice>}
          <div className={styles.buttons}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <Button
              label="Submit"
              type="submit"
              variant="primary"
              disabled={title.trim() === ''}
              busy={sending}
              busyLabel="Submitting…"
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}
