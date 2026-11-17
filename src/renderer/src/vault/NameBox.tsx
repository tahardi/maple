import { useState } from 'react';

type Props = {
  label: string;
  placeholder: string;
  initial?: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

export function NameBox({ label, placeholder, initial = '', busy, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial);
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
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
