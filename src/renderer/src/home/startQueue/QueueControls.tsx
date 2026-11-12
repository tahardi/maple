export function QueueControls({ cardKey, index, count }: { cardKey: string; index: number; count: number }) {
  return (
    <>
      <button
        aria-label={`Move ${cardKey} up`}
        disabled={index === 0}
        onClick={() => void window.maple.tabs.moveQueued(cardKey, -1)}
      >
        ↑
      </button>
      <button
        aria-label={`Move ${cardKey} down`}
        disabled={index === count - 1}
        onClick={() => void window.maple.tabs.moveQueued(cardKey, 1)}
      >
        ↓
      </button>
      <button aria-label={`Remove ${cardKey} from the queue`} onClick={() => void window.maple.tabs.unqueue(cardKey)}>
        ×
      </button>
    </>
  );
}
