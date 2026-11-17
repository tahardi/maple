import { useEffect, useState } from 'react';
import { ReportDialog } from './ReportDialog';

export function ReportLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      window.maple.app.onReportRequested(() => {
        setOpen(true);
      }),
    [],
  );

  if (!open) {
    return null;
  }
  return (
    <ReportDialog
      onClose={() => {
        setOpen(false);
      }}
    />
  );
}
