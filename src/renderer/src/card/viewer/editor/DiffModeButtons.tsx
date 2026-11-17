import type { DiffMode } from './useDiffMode';

export function DiffModeButtons({ mode, onChoose }: { mode: DiffMode; onChoose: (mode: DiffMode) => void }) {
  return (
    <div role="group" aria-label="Diff layout" data-variant="segmented">
      <button
        aria-pressed={mode === 'in-file'}
        onClick={() => {
          onChoose('in-file');
        }}
      >
        In file
      </button>
      <button
        aria-pressed={mode === 'side-by-side'}
        onClick={() => {
          onChoose('side-by-side');
        }}
      >
        Side by side
      </button>
    </div>
  );
}
