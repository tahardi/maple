import { useState } from 'react';
import { MarkdownText } from '@renderer/shell/MarkdownText';
import styles from './CommentEditor.module.css';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function CommentEditor({ label, value, onChange }: Props) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  return (
    <div className={styles.editor}>
      <div role="tablist" className={styles.tabs}>
        <button
          role="tab"
          className={styles.tab}
          aria-selected={mode === 'write'}
          onClick={() => {
            setMode('write');
          }}
        >
          Write
        </button>
        <button
          role="tab"
          className={styles.tab}
          aria-selected={mode === 'preview'}
          onClick={() => {
            setMode('preview');
          }}
        >
          Preview
        </button>
      </div>
      {mode === 'write' ? (
        <textarea
          aria-label={label}
          placeholder={label}
          className={styles.text}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      ) : value.trim() === '' ? (
        <p className={styles.empty}>Nothing to preview</p>
      ) : (
        <div className={styles.preview}>
          <MarkdownText text={value} />
        </div>
      )}
    </div>
  );
}
