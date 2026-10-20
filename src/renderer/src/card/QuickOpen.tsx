import type { SearchHit } from '@shared/types';
import { useState } from 'react';
import { matchFiles } from './matchFiles';
import styles from './QuickOpen.module.css';
import type { QuickOpenMode } from './useQuickOpenKeys';

type Props = {
  tabId: string;
  files: readonly string[];
  mode: QuickOpenMode;
  onOpen: (path: string, line: number | null) => void;
  onClose: () => void;
};

type Row = { path: string; line: number | null; label: string };

type Results = { query: string; hits: SearchHit[] } | { query: string; error: string };

export function QuickOpen({ tabId, files, mode, onOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [results, setResults] = useState<Results | null>(null);

  const rows: Row[] =
    mode === 'files'
      ? matchFiles(files, query).map((path) => ({ path, line: null, label: path }))
      : results !== null && 'hits' in results
        ? results.hits.map((hit) => ({
            path: hit.path,
            line: hit.line,
            label: `${hit.path}:${String(hit.line)} ${hit.text}`,
          }))
        : [];
  const searched = mode === 'text' && results !== null && results.query === query;

  const search = () => {
    const asked = query;
    setHighlight(0);
    window.maple.repo.search(tabId, asked).then(
      (hits) => {
        setResults({ query: asked, hits });
      },
      (err: unknown) => {
        setResults({ query: asked, error: err instanceof Error ? err.message : String(err) });
      },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((at) => Math.min(Math.max(at + step, 0), Math.max(rows.length - 1, 0)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'text' && !searched) {
        if (query.trim() !== '') {
          search();
        }
        return;
      }
      const row = rows.at(highlight);
      if (row !== undefined) {
        onOpen(row.path, row.line);
      }
    }
  };

  const message = () => {
    if (mode === 'files' || results === null || !searched) {
      return null;
    }
    if ('error' in results) {
      return results.error;
    }
    return results.hits.length === 0 ? 'No matches' : null;
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={mode === 'files' ? 'Quick open' : 'Search text'}
        className={styles.box}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <input
          className={styles.input}
          autoFocus
          value={query}
          placeholder={mode === 'files' ? 'Find a file by name' : 'Search text, press Enter'}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
        {message() !== null && <div className={styles.message}>{message()}</div>}
        <ul role="listbox" className={styles.list}>
          {rows.map((row, i) => (
            <li
              key={`${row.label}:${String(i)}`}
              role="option"
              aria-selected={i === highlight}
              className={i === highlight ? `${styles.row} ${styles.active}` : styles.row}
              onMouseEnter={() => {
                setHighlight(i);
              }}
              onClick={() => {
                onOpen(row.path, row.line);
              }}
            >
              {row.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
