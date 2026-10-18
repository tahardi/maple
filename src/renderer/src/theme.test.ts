const styles = import.meta.glob<string>('./**/*.css', { query: '?raw', import: 'default', eager: true });
const entry = import.meta.glob<string>('./main.tsx', { query: '?raw', import: 'default', eager: true });

const modules = Object.entries(styles).filter(([path]) => path.endsWith('.module.css'));
const theme = styles['./theme.css'] ?? '';

const hardCodedColor = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsl)\(|:[^;{}]*(?<![\w-])(?:white|black)(?![\w-])/g;

describe('theme', () => {
  test.each(modules)('%s has no hard-coded colors', (path, css) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedColor) ?? [];

    // then
    expect(matches, `${path} contains ${matches.join(', ')}`).toEqual([]);
  });

  test('every variable a module uses is defined', () => {
    // given
    const defined = new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

    // when
    const undefinedVars = modules.flatMap(([path, css]) =>
      [...css.matchAll(/var\(\s*(--[\w-]+)/g)].filter((m) => !defined.has(m[1])).map((m) => `${path}: ${m[1]}`),
    );

    // then
    expect(modules.length).toBeGreaterThan(0);
    expect(undefinedVars).toEqual([]);
  });

  test('theme.css sets a dark color scheme and page background', () => {
    // given
    const css = theme;

    // when
    const body = /[^{}]*\bbody\b[^{}]*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(css).toMatch(/color-scheme:\s*dark/);
    expect(body).toMatch(/background:\s*var\(--bg\)/);
  });

  test('main.tsx imports the theme', () => {
    // given
    const source = entry['./main.tsx'] ?? '';

    // when
    const imported = /^import '\.\/theme\.css';$/m.test(source);

    // then
    expect(imported).toBe(true);
  });
});
