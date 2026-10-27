import { highlightCode } from './highlightCode';

const { setTheme, colorize } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  colorize: vi.fn<() => Promise<string>>(() => Promise.resolve('<span class="mtk6">const</span>')),
}));

vi.mock('monaco-editor/editor/editor.api', () => ({
  languages: {
    getLanguages: () => [
      { id: 'typescript', aliases: ['TypeScript', 'ts'], extensions: ['.ts', '.tsx'] },
      { id: 'plaintext' },
    ],
  },
  editor: { setTheme, colorize },
}));
vi.mock('@renderer/card/viewer/monacoSetup', () => ({}));

describe('highlightCode', () => {
  beforeEach(() => {
    setTheme.mockClear();
    colorize.mockClear();
  });

  test.each([{ lang: 'typescript' }, { lang: 'TypeScript' }, { lang: 'ts' }, { lang: 'tsx' }])(
    'colors $lang as typescript',
    async ({ lang }) => {
      // given
      const code = 'const a = 1';
      // when
      const html = await highlightCode(code, lang);
      // then
      expect(html).toBe('<span class="mtk6">const</span>');
      expect(setTheme).toHaveBeenCalledWith('vs-dark');
      expect(colorize).toHaveBeenCalledWith('const a = 1', 'typescript', {});
    },
  );

  test('returns null for a language Monaco does not know', async () => {
    // given
    const code = 'const a = 1';
    // when
    const html = await highlightCode(code, 'nope');
    // then
    expect(html).toBeNull();
    expect(setTheme).not.toHaveBeenCalled();
    expect(colorize).not.toHaveBeenCalled();
  });

  test('colors a language that has no aliases or extensions by its id', async () => {
    // given
    const code = 'hello';
    // when
    await highlightCode(code, 'plaintext');
    // then
    expect(colorize).toHaveBeenCalledWith('hello', 'plaintext', {});
  });

  test('rejects when colorizing fails', async () => {
    // given
    colorize.mockRejectedValueOnce(new Error('colorizing: failed'));
    // when
    const result = highlightCode('const a = 1', 'ts');
    // then
    await expect(result).rejects.toThrow('colorizing: failed');
  });
});
