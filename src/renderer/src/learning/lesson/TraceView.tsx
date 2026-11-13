import { Editor } from '@monaco-editor/react';
import type { Trace } from '@shared/types/learning/trace';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useState } from 'react';
import { EDITOR_OPTIONS } from '@renderer/card/viewer/editor/editorOptions';
import '@renderer/card/viewer/editor/monacoSetup';
import { Button } from '@renderer/shell/blocks/Button';
import styles from './LessonPage.module.css';

const OPTIONS = { ...EDITOR_OPTIONS, minimap: { enabled: false }, scrollBeyondLastLine: false } as const;
const LINE_HEIGHT = 19;

export function TraceView({ trace }: { trace: Trace }) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<editor.ICodeEditor | null>(null);
  const last = trace.steps.length - 1;
  const current = Math.min(step, last);
  const [first, end] = trace.steps[current].lines;

  useEffect(() => {
    if (target === null) {
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
      <Editor
        value={trace.code}
        language={trace.lang}
        theme="vs-dark"
        height={trace.code.split('\n').length * LINE_HEIGHT + 8}
        options={OPTIONS}
        onMount={setTarget}
      />
      <p className={styles.stepCount}>
        Step {current + 1} of {trace.steps.length}
      </p>
      <p>{trace.steps[current].text}</p>
      <div className={styles.actions}>
        <Button
          label="Back"
          disabled={current === 0}
          reason={current === 0 ? 'First step' : null}
          onClick={() => {
            setStep(current - 1);
          }}
        />
        <Button
          label="Next"
          disabled={current === last}
          reason={current === last ? 'Last step' : null}
          onClick={() => {
            setStep(current + 1);
          }}
        />
      </div>
    </div>
  );
}
