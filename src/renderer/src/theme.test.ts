const styles = import.meta.glob<string>('./**/*.css', { query: '?raw', import: 'default', eager: true });
const entry = import.meta.glob<string>('./main.tsx', { query: '?raw', import: 'default', eager: true });

const modules = Object.entries(styles).filter(([path]) => path.endsWith('.module.css'));
const theme = styles['./theme.css'] ?? '';

const hardCodedColor = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsl)\(|:[^;{}]*(?<![\w-])(?:white|black)(?![\w-])/g;

const palette = [
  ['--bg', '#1e1e1e'],
  ['--bg-raised', '#252526'],
  ['--bg-sunken', '#181818'],
  ['--surface', '#2d2d2d'],
  ['--surface-hover', '#37373d'],
  ['--bar', '#2b2b2b'],
  ['--border', '#3c3c3c'],
  ['--text', '#d4d4d4'],
  ['--text-muted', '#9d9d9d'],
  ['--text-strong', '#ffffff'],
  ['--link', '#4fa3e0'],
  ['--accent', '#0e639c'],
  ['--danger', '#e5534b'],
  ['--danger-bg', '#5a1d1d'],
  ['--warning', '#d4b106'],
  ['--warning-bg', '#4d3f00'],
  ['--warning-text', '#f7e27a'],
  ['--success', '#57ab5a'],
  ['--idle', '#8b949e'],
  ['--diff-add-bg', 'rgba(87, 171, 90, 0.15)'],
  ['--diff-chg-bg', 'rgba(212, 177, 6, 0.15)'],
  ['--diff-del', '#e5534b'],
  ['--overlay', 'rgb(0 0 0 / 60%)'],
];

describe('theme', () => {
  test.each([
    ['a short hex', 'color: #fff;', ['#fff']],
    ['a long hex with alpha', 'box-shadow: 0 0 0 2px #d4b10666;', ['#d4b10666']],
    ['rgb', 'background: rgb(0 0 0 / 50%);', ['rgb(']],
    ['rgba', 'background: rgba(0, 0, 0, 0.5);', ['rgba(']],
    ['hsl', 'color: hsl(0 0% 100%);', ['hsl(']],
    ['white as a value', 'background: white;', [': white']],
    ['black as a value', 'border: 1px solid black;', [': 1px solid black']],
    ['a variable', 'color: var(--text);', []],
    ['white-space', 'white-space: nowrap;', []],
    ['a class named after a color', '.white-row {\n  color: var(--text);\n}', []],
  ])('the color check flags %s', (_name, css, want) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedColor) ?? [];

    // then
    expect(matches).toEqual(want);
  });

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

  test.each(palette)('theme.css defines %s as %s', (name, value) => {
    // given
    const css = theme;

    // when
    const declared = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css)?.[1];

    // then
    expect(declared).toBe(value);
  });

  test('theme.css sets a dark color scheme and page background', () => {
    // given
    const css = theme;

    // when
    const body = /[^{}]*\bbody\b[^{}]*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(css).toMatch(/color-scheme:\s*dark/);
    expect(body).toMatch(/background:\s*var\(--bg\)/);
    expect(body).toMatch(/color:\s*var\(--text\)/);
    expect(body).toMatch(/margin:\s*0/);
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
