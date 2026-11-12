import { useMonaco } from '@monaco-editor/react';
import { lineMarks } from '@shared/diff/diffMarks';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo } from 'react';
import { toDecorations } from './inFileDecorations';

export function useLineMarks(target: editor.ICodeEditor | null, base: string | null, current: string | null): void {
  const monaco = useMonaco();

  const specs = useMemo(
    () => (current !== null && base !== current ? toDecorations(lineMarks(base, current)) : []),
    [base, current],
  );

  useEffect(() => {
    if (target === null || monaco === null) {
      return;
    }
    const decorations = target.createDecorationsCollection(
      specs.map((spec) => ({
        range: { startLineNumber: spec.startLine, startColumn: 1, endLineNumber: spec.endLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: spec.className,
          marginClassName: spec.marginClassName,
          overviewRuler: { color: spec.overviewColor, position: monaco.editor.OverviewRulerLane.Full },
          minimap: { color: spec.overviewColor, position: monaco.editor.MinimapPosition.Gutter },
          hoverMessage: spec.hover === null ? null : { value: spec.hover },
        },
      })),
    );
    return () => {
      decorations.clear();
    };
  }, [target, monaco, specs]);
}
