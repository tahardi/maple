import { describe, expect, test } from 'vitest';
import { readFrontmatter, writeFrontmatter } from './frontmatter';

describe('frontmatter', () => {
  test.each([
    {
      name: 'splits data and body',
      text: '---\nstatus: learned\ncomfortable: true\n---\n# Title\n',
      want: { data: { status: 'learned', comfortable: true }, body: '# Title\n' },
    },
    {
      name: 'reads a note with no block as empty data',
      text: '# Title\n\nBody\n',
      want: { data: {}, body: '# Title\n\nBody\n' },
    },
    {
      name: 'reads an empty block as empty data',
      text: '---\n---\n# Title\n',
      want: { data: {}, body: '# Title\n' },
    },
    {
      name: 'keeps grade dates as text',
      text: '---\ngrades:\n  - { date: 2026-11-12, score: 4, total: 5 }\n---\n',
      want: { data: { grades: [{ date: '2026-11-12', score: 4, total: 5 }] }, body: '' },
    },
  ])('readFrontmatter $name', ({ text, want }) => {
    // given
    const note = text;
    // when
    const got = readFrontmatter(note);
    // then
    expect(got).toEqual(want);
  });

  test.each([
    { name: 'bad YAML', text: '---\nstatus: [to-learn\n---\n# T\n' },
    { name: 'a block that is not a map', text: '---\n- a\n- b\n---\n# T\n' },
  ])('readFrontmatter throws on $name', ({ text }) => {
    // given
    const note = text;
    // when
    const got = () => readFrontmatter(note);
    // then
    expect(got).toThrow(/^reading frontmatter: /);
  });

  test.each([
    {
      name: 'sets one key and keeps other keys and the body byte for byte',
      text:
        '---\nclass: xss\nstatus: learned\ncomfortable: false\naliases: [a, b]\n' +
        'grades:\n  - { date: 2026-11-12, score: 4, total: 5 }\n---\n# XSS\n\n## Findings\n  odd  spacing \n',
      fields: { comfortable: true },
      want:
        '---\nclass: xss\nstatus: learned\ncomfortable: true\naliases: [a, b]\n' +
        'grades:\n  - { date: 2026-11-12, score: 4, total: 5 }\n---\n# XSS\n\n## Findings\n  odd  spacing \n',
    },
    {
      name: 'adds a missing key at the end of the block',
      text: '---\nclass: xss\n---\n# XSS\n',
      fields: { comfortable: true },
      want: '---\nclass: xss\ncomfortable: true\n---\n# XSS\n',
    },
    {
      name: 'adds a block when there is none',
      text: '# XSS\n',
      fields: { comfortable: false },
      want: '---\ncomfortable: false\n---\n# XSS\n',
    },
    {
      name: 'fills an empty block',
      text: '---\n---\n# XSS\n',
      fields: { comfortable: true },
      want: '---\ncomfortable: true\n---\n# XSS\n',
    },
  ])('writeFrontmatter $name', ({ text, fields, want }) => {
    // given
    const note = text;
    // when
    const got = writeFrontmatter(note, fields);
    // then
    expect(got).toBe(want);
  });

  test('writeFrontmatter throws on bad YAML', () => {
    // given
    const note = '---\nstatus: [to-learn\n---\n# T\n';
    // when
    const got = () => writeFrontmatter(note, { comfortable: true });
    // then
    expect(got).toThrow(/^writing frontmatter: /);
  });
});
