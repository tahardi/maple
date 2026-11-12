import { renderHook } from '@testing-library/react';
import type { editor } from 'monaco-editor/editor/editor.api';
import { monaco } from '@renderer/testing/fakeMonaco';
import { useLineMarks } from './useLineMarks';

vi.mock('@monaco-editor/react', () => import('@renderer/testing/fakeMonaco'));

const target = monaco.editor as unknown as editor.ICodeEditor;

describe('useLineMarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monaco.enabled.value = true;
  });

  test('marks the lines that differ from the base', () => {
    // given
    // when
    renderHook(() => {
      useLineMarks(target, 'old\n', 'new\n');
    });
    // then
    expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([
      expect.objectContaining({
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        options: expect.objectContaining({ isWholeLine: true, className: 'line-chg' }) as unknown,
      }),
    ]);
  });

  test('adds no marks when the text matches the base', () => {
    // given
    // when
    renderHook(() => {
      useLineMarks(target, 'same\n', 'same\n');
    });
    // then
    expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([]);
  });

  test('adds no marks without current text', () => {
    // given
    // when
    renderHook(() => {
      useLineMarks(target, 'old\n', null);
    });
    // then
    expect(monaco.editor.createDecorationsCollection).toHaveBeenLastCalledWith([]);
  });

  test('clears the old marks when the text changes', () => {
    // given
    const { rerender } = renderHook(
      ({ current }) => {
        useLineMarks(target, 'old\n', current);
      },
      { initialProps: { current: 'new\n' } },
    );
    // when
    rerender({ current: 'newer\n' });
    // then
    expect(monaco.collection.clear).toHaveBeenCalled();
  });
});
