import { useId } from 'react';
import styles from './Button.module.css';

type ButtonProps = {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'danger';
  pressed?: boolean;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  reason?: string | null;
  hint?: string | null;
  fix?: { label: string; onClick: () => void } | null;
};

export function Button(props: ButtonProps) {
  const { label, onClick, type = 'button', variant, pressed, disabled, busy, busyLabel, reason, hint, fix } = props;
  const id = useId();
  const note = reason ?? hint ?? null;
  return (
    <>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled === true || busy === true}
        aria-busy={busy === true ? true : undefined}
        aria-pressed={pressed}
        aria-describedby={note === null ? undefined : id}
        data-variant={variant}
      >
        {busy === true ? (busyLabel ?? label) : label}
      </button>
      {note !== null && (
        <span id={id} className={styles.reason} data-kind={reason == null ? 'hint' : undefined}>
          {note}
        </span>
      )}
      {fix != null && (
        <button type="button" onClick={fix.onClick}>
          {fix.label}
        </button>
      )}
    </>
  );
}
