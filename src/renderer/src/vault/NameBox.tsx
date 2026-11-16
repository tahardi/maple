import { useState } from 'react';

type Props = { label: string; busy: boolean; onSubmit: (name: string) => void; onCancel: () => void };

export function NameBox({ label, busy, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  return (
    <input
      aria-label={label}
      autoFocus
      readOnly={busy}
      value={name}
      onChange={(e) => {
        setName(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onCancel();
        } else if (e.key === 'Enter' && !busy) {
          const trimmed = name.trim();
          if (trimmed === '') {
            onCancel();
          } else {
            onSubmit(trimmed);
          }
        }
      }}
    />
  );
}
