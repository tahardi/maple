import { Editor } from '@monaco-editor/react';
import type { Trace } from '@shared/types/learning/trace';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useState } from 'react';
import { EDITOR_OPTIONS } from '@renderer/card/viewer/editor/editorOptions';
import '@renderer/card/viewer/editor/monacoSetup';
import styles from './LessonPage.module.css';

const LINE_HEIGHT = 19;
const OPTIONS = {
  ...EDITOR_OPTIONS,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineHeight: LINE_HEIGHT,
  automaticLayout: true,
} as const;

function linesLabel([first, last]: readonly [number, number]): string {
  return first === last ? `Line ${String(first)}` : `Lines ${String(first)}–${String(last)}`;
}

export function TraceView({ trace, step }: { trace: Trace; step: number | null }) {
  const [target, setTarget] = useState<editor.ICodeEditor | null>(null);
  const current = step === null ? null : Math.min(step, trace.steps.length - 1);
  const lines = current === null ? null : trace.steps[current].lines;
  const first = lines?.[0] ?? null;
  const end = lines?.[1] ?? null;

  useEffect(() => {
    if (target === null || first === null || end === null) {
      return;
    }
    const decorations = target.createDecorationsCollection([
      {
        range: { startLineNumber: first, startColumn: 1, endLineNumber: end, endColumn: 1 },
        options: { isWholeLine: true, className: 'trace-step' },
      },
    ]);
    target.revealLineInCenter(first);
    return () => {
      decorations.clear();
    };
  }, [target, first, end]);

  return (
    <div className={styles.trace}>
      <p className={styles.provenance}>Teaching example, not code from your repository</p>
      <Editor
        value={trace.code}
        language={trace.lang}
        theme="vs-dark"
        height={trace.code.split('\n').length * LINE_HEIGHT + 8}
        options={OPTIONS}
        onMount={setTarget}
      />
      {current === null ? (
        <ol className={styles.traceSteps}>
          {trace.steps.map((s, index) => (
            <li key={index}>{`${linesLabel(s.lines)}: ${s.text}`}</li>
          ))}
        </ol>
      ) : (
        <>
          <p className={styles.stepCount}>
            Code step {current + 1} of {trace.steps.length}
          </p>
          <p>{trace.steps[current].text}</p>
        </>
      )}
    </div>
  );
}
