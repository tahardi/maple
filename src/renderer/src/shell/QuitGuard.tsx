import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export function QuitGuard() {
  const [working, setWorking] = useState<readonly string[]>([]);

  useEffect(() => window.maple.app.onQuitRequested(setWorking), []);

  if (working.length === 0) {
    return null;
  }
  return (
    <ConfirmDialog
      title="Quit Maple"
      body={`Quit while ${working.join(', ')} ${working.length === 1 ? 'is' : 'are'} working?`}
      confirmLabel="Quit"
      onConfirm={() => {
        window.maple.app.confirmQuit();
      }}
      onCancel={() => {
        setWorking([]);
      }}
    />
  );
}
