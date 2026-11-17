import type { Draft } from '@shared/types/files/draft';
import { Notice } from '@renderer/shell/blocks/Notice';
import { useMaple } from '@renderer/store';

export function DraftNotices({
  tabId,
  path,
  draft,
  disk,
  saveError,
  onReload,
}: {
  tabId: string;
  path: string;
  draft: Draft | null;
  disk: string | null;
  saveError: { path: string; message: string } | null;
  onReload?: () => void;
}) {
  const setDraft = useMaple((s) => s.setDraft);
  return (
    <>
      {saveError?.path === path && <Notice tone="danger">{`Saving failed: ${saveError.message}`}</Notice>}
      {draft !== null && draft.disk !== disk && (
        <Notice tone="warning">
          File changed on disk
          <button
            onClick={() => {
              onReload?.();
              setDraft(tabId, path, null);
            }}
          >
            Reload
          </button>
          <button
            onClick={() => {
              setDraft(tabId, path, { text: draft.text, disk });
            }}
          >
            Keep mine
          </button>
        </Notice>
      )}
    </>
  );
}
