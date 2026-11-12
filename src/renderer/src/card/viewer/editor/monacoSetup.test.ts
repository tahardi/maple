import { describe, expect, test, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ hover: false }));

vi.mock('@monaco-editor/react', () => ({ loader: { config: vi.fn() } }));
vi.mock('monaco-editor/editor/editor.api', () => ({}));
vi.mock('monaco-editor/basic-languages/monaco.contribution', () => ({}));
vi.mock('monaco-editor/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/editor/contrib/hover/browser/hoverContribution', () => {
  loaded.hover = true;
  return {};
});
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({ default: vi.fn() }));

describe('monacoSetup', () => {
  test('loads the hover contribution so decoration hovers show', async () => {
    // given
    loaded.hover = false;
    // when
    await import('./monacoSetup');
    // then
    expect(loaded.hover).toBe(true);
  });
});
