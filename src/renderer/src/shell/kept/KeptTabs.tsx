import { useState } from 'react';
import type { KeptTab } from '@shared/types/tabs/keptTab';
import { useMaple } from '@renderer/store';
import { Button } from '../blocks/Button';
import { Notice } from '../blocks/Notice';
import { ConfirmDialog } from '../ConfirmDialog';
import { tabLabel } from '../tabs/tabLabel';

function labelOf({ tab }: KeptTab): string {
  return tab.cardKey ?? `${tab.projectKey} ${tabLabel(tab)}`;
}

export function KeptTabs() {
  const keptTabs = useMaple((s) => s.keptTabs);
  const discardKept = useMaple((s) => s.discardKept);
  const [confirming, setConfirming] = useState<KeptTab | null>(null);
  if (keptTabs.length === 0) {
    return null;
  }
  return (
    <Notice tone="warning">
      Tabs kept until they can open again:
      <ul>
        {keptTabs.map((kept) => {
          const label = labelOf(kept);
          return (
            <li key={kept.tab.id}>
              {`${label}: ${kept.reason}`}
              <Button
                label="Discard"
                ariaLabel={`Discard ${label}`}
                onClick={() => {
                  setConfirming(kept);
                }}
              />
            </li>
          );
        })}
      </ul>
      {confirming !== null && (
        <ConfirmDialog
          title={`Discard ${labelOf(confirming)}?`}
          body="Maple will stop keeping this tab, so it will not come back when its project returns."
          confirmLabel="Discard tab"
          danger
          onConfirm={() => {
            setConfirming(null);
            discardKept(confirming.tab.id).catch(() => undefined);
          }}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      )}
    </Notice>
  );
}
