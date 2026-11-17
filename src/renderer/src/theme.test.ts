const styles = import.meta.glob<string>('./**/*.css', { query: '?raw', import: 'default', eager: true });
const entry = import.meta.glob<string>('./main.tsx', { query: '?raw', import: 'default', eager: true });

const modules = Object.entries(styles).filter(([path]) => path.endsWith('.module.css'));
const theme = styles['./theme.css'] ?? '';

const hardCodedColor = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsl)\(|:[^;{}]*(?<![\w-])(?:white|black)(?![\w-])/g;

const hardCodedFontSize = /font-size:(?!\s*var\(--font-)[^;]+/g;

const spacingProperties = 'padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left';

const hardCodedSpacing = new RegExp(
  `(?<![\\w-])(?:${spacingProperties})(?:-[a-z]+)*\\s*:[^;{}]*?(?<![\\d.])(?:[4-9]|\\d{2,})px`,
  'g',
);

const hardCodedRadius = /border(?:-[a-z]+)*-radius\s*:(?!\s*var\(--radius-)[^;]+/g;

const hardCodedZIndex = /z-index\s*:(?!\s*var\(--z-)[^;]+/g;

const removedOutline = /outline(?:-style|-width)?\s*:\s*(?:none|0(?:px)?)\b/g;

const palette = [
  ['--bg', '#1e1e1e'],
  ['--bg-raised', '#252526'],
  ['--bg-sunken', '#181818'],
  ['--surface', '#2d2d2d'],
  ['--surface-hover', '#37373d'],
  ['--bar', '#2b2b2b'],
  ['--border', '#767676'],
  ['--divider', '#3c3c3c'],
  ['--text', '#d4d4d4'],
  ['--text-muted', '#9d9d9d'],
  ['--text-strong', '#ffffff'],
  ['--link', '#4fa3e0'],
  ['--accent', '#0e639c'],
  ['--accent-strong', '#4fa3e0'],
  ['--focus-ring', 'var(--accent-strong)'],
  ['--danger', '#ff7b72'],
  ['--danger-bg', '#5a1d1d'],
  ['--warning', '#d4b106'],
  ['--warning-bg', '#4d3f00'],
  ['--warning-text', '#f7e27a'],
  ['--success', '#57ab5a'],
  ['--idle', '#8b949e'],
  ['--diff-add-bg', 'rgba(87, 171, 90, 0.15)'],
  ['--diff-chg-bg', 'rgba(79, 163, 224, 0.15)'],
  ['--diff-del', '#e5534b'],
  ['--overlay', 'rgb(0 0 0 / 60%)'],
  ['--minimap-slider', 'rgba(121, 121, 121, 0.2)'],
  ['--minimap-slider-hover', 'rgba(121, 121, 121, 0.35)'],
  ['--epic-purple', '#b8acf6'],
  ['--epic-blue', '#85b8ff'],
  ['--epic-green', '#7ee2b8'],
  ['--epic-teal', '#9dd9ee'],
  ['--epic-yellow', '#f5cd47'],
  ['--epic-orange', '#fec195'],
  ['--epic-red', '#fd9891'],
  ['--epic-magenta', '#f797d2'],
  ['--epic-lime', '#b3df72'],
  ['--epic-grey', '#9fadbc'],
  ['--font-xs', '11px'],
  ['--font-sm', '12px'],
  ['--font-md', '13px'],
  ['--font-lg', '14px'],
  ['--font-xl', '16px'],
  ['--space-1', '4px'],
  ['--space-2', '8px'],
  ['--space-3', '12px'],
  ['--space-4', '16px'],
  ['--radius-sm', '4px'],
  ['--radius-md', '6px'],
  ['--radius-full', '999px'],
  ['--z-menu', '100'],
  ['--z-dialog', '200'],
];

const contrastRows = [
  ...['--text', '--text-muted', '--danger'].flatMap((fg) =>
    ['--bg', '--bg-raised', '--surface'].map((bg) => [fg, bg, 4.5] as const),
  ),
  ['--danger', '--surface-hover', 4.5] as const,
  ...['--bg', '--bg-raised', '--surface'].map((bg) => ['--border', bg, 3] as const),
  ...['--bg', '--bg-raised', '--surface', '--surface-hover'].map((bg) => ['--accent-strong', bg, 3] as const),
];

describe('theme', () => {
  const token = (name: string): string => new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(theme)?.[1] ?? '';

  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const contrastRatio = (foreground: string, background: string): number => {
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };

  test.each([
    ['#000000', '#ffffff', 21],
    ['#3c3c3c', '#1e1e1e', 1.51],
    ['#e5534b', '#252526', 4.14],
  ])('the contrast check measures %s on %s as %s', (foreground, background, want) => {
    // given
    const pair = [foreground, background] as const;

    // when
    const ratio = contrastRatio(...pair);

    // then
    expect(ratio).toBeCloseTo(want, 2);
  });

  test.each(contrastRows)('%s on %s reaches %s:1', (foreground, background, minimum) => {
    // given
    const colors = [token(foreground), token(background)] as const;

    // when
    const ratio = contrastRatio(...colors);

    // then
    expect(ratio).toBeGreaterThanOrEqual(minimum);
  });

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

  test.each([
    ['a spaced token', 'font-size: var(--font-md);', []],
    ['an unspaced token', 'font-size:var(--font-md);', []],
    ['pixels', 'font-size: 12px;', ['font-size: 12px']],
    ['a calc', 'font-size: calc(1px + 2px);', ['font-size: calc(1px + 2px)']],
  ])('the font size check on %s', (_name, css, want) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedFontSize) ?? [];

    // then
    expect(matches).toEqual(want);
  });

  test.each(modules)('%s sizes text with theme font sizes', (path, css) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedFontSize) ?? [];

    // then
    expect(matches, `${path} contains ${matches.join(', ')}`).toEqual([]);
  });

  test.each([
    ['padding: var(--space-2) var(--space-3);', []],
    ['padding: 6px 8px;', ['padding: 6px']],
    ['margin: 2px 0 0;', []],
    ['top: calc(100% + 4px);', ['top: calc(100% + 4px']],
    ['border-left: 4px solid var(--border);', []],
    ['width: 140px;', []],
    ['row-gap: 6px;', ['row-gap: 6px']],
    ['gap: 3px;', []],
    ['gap: 4px;', ['gap: 4px']],
    ['padding-inline-start: 8px;', ['padding-inline-start: 8px']],
  ])('the spacing check on %s', (css, want) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedSpacing) ?? [];

    // then
    expect(matches).toEqual(want);
  });

  test.each([
    ['border-radius: var(--radius-md);', []],
    ['border-radius: 50%;', ['border-radius: 50%']],
    ['border-top-left-radius: 4px;', ['border-top-left-radius: 4px']],
  ])('the radius check on %s', (css, want) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedRadius) ?? [];

    // then
    expect(matches).toEqual(want);
  });

  test.each([
    ['z-index: var(--z-menu);', []],
    ['z-index: 10;', ['z-index: 10']],
  ])('the layer check on %s', (css, want) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedZIndex) ?? [];

    // then
    expect(matches).toEqual(want);
  });

  test.each([
    ['outline: none;', ['outline: none']],
    ['outline: 0;', ['outline: 0']],
    ['outline: 0px;', ['outline: 0px']],
    ['outline-style: none;', ['outline-style: none']],
    ['outline-width: 0;', ['outline-width: 0']],
    ['outline: 2px solid var(--warning);', []],
    ['outline-offset: 0;', []],
  ])('the outline check on %s', (css, want) => {
    // given
    const source = css;

    // when
    const matches = source.match(removedOutline) ?? [];

    // then
    expect(matches).toEqual(want);
  });

  test.each(modules)('%s spaces with theme spacing', (path, css) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedSpacing) ?? [];

    // then
    expect(matches, `${path} contains ${matches.join(', ')}`).toEqual([]);
  });

  test.each(modules)('%s rounds corners with theme radii', (path, css) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedRadius) ?? [];

    // then
    expect(matches, `${path} contains ${matches.join(', ')}`).toEqual([]);
  });

  test.each(modules)('%s layers with theme z-indexes', (path, css) => {
    // given
    const source = css;

    // when
    const matches = source.match(hardCodedZIndex) ?? [];

    // then
    expect(matches, `${path} contains ${matches.join(', ')}`).toEqual([]);
  });

  test.each(modules)('%s keeps the focus ring', (path, css) => {
    // given
    const source = css;

    // when
    const matches = source.match(removedOutline) ?? [];

    // then
    expect(matches, `${path} contains ${matches.join(', ')}`).toEqual([]);
  });

  test('theme.css draws one focus ring', () => {
    // given
    const css = theme;

    // when
    const ring = /:where\(:focus-visible\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(ring).toContain('outline: 2px solid var(--focus-ring)');
    expect(ring).toContain('outline-offset: 2px');
  });

  test('only warnings use the warning colors', () => {
    // given
    const warning = /var\(--warning/;

    // when
    const paths = modules.filter(([, css]) => warning.test(css)).map(([path]) => path);

    // then
    expect(paths).toEqual(['./shell/blocks/Badge.module.css', './shell/blocks/Notice.module.css']);
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
    const tokenName = name;

    // when
    const declared = token(tokenName);

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

  test('the page uses the medium font size', () => {
    // given
    const css = theme;

    // when
    const body = /[^{}]*\bbody\b[^{}]*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(body).toMatch(/font-size:\s*var\(--font-md\)/);
  });

  test('theme.css styles buttons without adding specificity', () => {
    // given
    const css = theme;

    // when
    const selectors = [
      ':where(button)',
      ':where(button:hover:enabled)',
      ':where(button:disabled)',
      ":where(button[aria-pressed='true'])",
      ":where(button[data-variant='primary'])",
      ":where(button[data-variant='danger'])",
    ];

    // then
    expect(selectors.filter((selector) => !css.includes(selector))).toEqual([]);
  });

  test('a disabled button drops its fill and colored border', () => {
    // given
    const css = theme;

    // when
    const disabled = /:where\(button:disabled\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(disabled).toMatch(/background:\s*transparent/);
    expect(disabled).toMatch(/border-color:\s*var\(--border\)/);
  });

  test('filled buttons change on hover', () => {
    // given
    const css = theme;

    // when
    const hover = /:where\(([^{}]*:hover:enabled[^{}]*)\)\s*\{[^}]*filter:/.exec(css)?.[1] ?? '';

    // then
    expect(hover).toContain("button[data-variant='primary']:hover:enabled");
    expect(hover).toContain("button[aria-pressed='true']:hover:enabled");
  });

  test('inputs and textareas use the page font', () => {
    // given
    const css = theme;

    // when
    const fields = /:where\(input, textarea\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(fields).toMatch(/font:\s*inherit/);
  });

  test('the disabled button style comes after the pressed and variant styles', () => {
    // given
    const later = [
      ":where(button[aria-pressed='true'])",
      ":where(button[data-variant='primary'])",
      ":where(button[data-variant='danger'])",
    ];

    // when
    const lastOverride = Math.max(...later.map((selector) => theme.indexOf(selector)));

    // then
    expect(theme.indexOf(':where(button:disabled)')).toBeGreaterThan(lastOverride);
  });

  test('a busy button shows a progress cursor after the disabled style', () => {
    // given
    const css = theme;

    // when
    const busy = /:where\(button\[aria-busy='true'\]\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // then
    expect(busy).toMatch(/cursor:\s*progress/);
    expect(css.indexOf(":where(button[aria-busy='true'])")).toBeGreaterThan(css.indexOf(':where(button:disabled)'));
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
