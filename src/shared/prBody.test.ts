import { describe, expect, test } from 'vitest';
import { dropImpact, impactItems, parsePrBody } from './prBody';

describe('parsePrBody', () => {
  test.each([
    {
      name: 'level 2 headings',
      body: '## Deviations from the card\nNone\n\n## Needs Taylor\n- Try it on device\n',
      expected: { deviations: 'None', needsTaylor: '- Try it on device', cardImpacts: null },
    },
    {
      name: 'level 3 headings',
      body: '### Deviations from the card\nNone\n\n### Needs Taylor\n- Try it on device\n',
      expected: { deviations: 'None', needsTaylor: '- Try it on device', cardImpacts: null },
    },
    {
      name: 'headings in a different case',
      body: '## deviations FROM the card\nNone\n\n## needs taylor\n- Try it on device\n',
      expected: { deviations: 'None', needsTaylor: '- Try it on device', cardImpacts: null },
    },
    {
      name: 'Windows line endings',
      body: '## Deviations from the card\r\nNone\r\n\r\n## Needs Taylor\r\n- One\r\n- Two\r\n',
      expected: { deviations: 'None', needsTaylor: '- One\n- Two', cardImpacts: null },
    },
    {
      name: 'card impacts',
      body: '## Needs Taylor\nNone\n\n## Card impacts\n- MPL-15: rename foo to bar\n',
      expected: { deviations: null, needsTaylor: 'None', cardImpacts: '- MPL-15: rename foo to bar' },
    },
    {
      name: 'both sections missing',
      body: '## Describe your changes\nStuff\n',
      expected: { deviations: null, needsTaylor: null, cardImpacts: null },
    },
    {
      name: 'section ending at the next heading of the same or higher level',
      body: '## Needs Taylor\n- One\n### Detail\n- Two\n# Other\nignored\n## Deviations from the card\nA\n## Next\nB\n',
      expected: { deviations: 'A', needsTaylor: '- One\n### Detail\n- Two', cardImpacts: null },
    },
  ])('parses $name', ({ body, expected }) => {
    // given
    const input = body;
    // when
    const result = parsePrBody(input);
    // then
    expect(result).toEqual(expected);
  });
});

describe('impactItems', () => {
  test.each([
    { name: 'one bullet per line', section: '- MPL-1: a\n- MPL-2: b', expected: ['- MPL-1: a', '- MPL-2: b'] },
    {
      name: 'an indented continuation line',
      section: '- MPL-1: a\n  more about a\n- MPL-2: b',
      expected: ['- MPL-1: a\n  more about a', '- MPL-2: b'],
    },
    {
      name: 'prose, blank lines, and nested bullets',
      section: 'Intro\n\n- MPL-1: a\n  - detail\n\n- MPL-2: b',
      expected: ['- MPL-1: a\n  - detail', '- MPL-2: b'],
    },
    { name: 'None', section: 'None', expected: [] },
    { name: 'null', section: null, expected: [] },
  ])('splits $name', ({ section, expected }) => {
    // given
    const input = section;
    // when
    const result = impactItems(input);
    // then
    expect(result).toEqual(expected);
  });
});

describe('dropImpact', () => {
  test.each([
    {
      name: 'the middle of three bullets',
      body: '## Needs Taylor\nNone\n\n## Card impacts\n- MPL-1: a\n- MPL-2: b\n  more about b\n- MPL-3: c\n\n## Tests\n- one\n',
      item: '- MPL-2: b\n  more about b',
      expected: '## Needs Taylor\nNone\n\n## Card impacts\n- MPL-1: a\n- MPL-3: c\n\n## Tests\n- one\n',
    },
    {
      name: 'the only bullet',
      body: '## Card impacts\n- MPL-1: a\n\n## Tests\n- one\n',
      item: '- MPL-1: a',
      expected: '## Card impacts\nNone\n\n## Tests\n- one\n',
    },
    {
      name: 'the last bullet of a body without a trailing newline',
      body: '## Card impacts\n- MPL-1: a\n- MPL-2: b',
      item: '- MPL-2: b',
      expected: '## Card impacts\n- MPL-1: a',
    },
    {
      name: 'only the first of two identical bullets',
      body: '## Card impacts\n- MPL-1: a\n- MPL-1: a\n',
      item: '- MPL-1: a',
      expected: '## Card impacts\n- MPL-1: a\n',
    },
    {
      name: 'a bullet with Windows line endings',
      body: '## Card impacts\r\n- MPL-1: a\r\n- MPL-2: b\r\n\r\n## Tests\r\n- one\r\n',
      item: '- MPL-1: a',
      expected: '## Card impacts\r\n- MPL-2: b\r\n\r\n## Tests\r\n- one\r\n',
    },
  ])('drops $name', ({ body, item, expected }) => {
    // given
    const input = body;
    // when
    const result = dropImpact(input, item);
    // then
    expect(result).toBe(expected);
  });

  test.each([
    { name: 'the item is not in the section', body: '## Card impacts\n- MPL-1: a\n\n## Tests\n- MPL-99: x\n' },
    { name: 'there is no section', body: '## Tests\n- MPL-99: x\n' },
  ])('throws when $name', ({ body }) => {
    // given
    const input = body;
    // when
    const drop = () => dropImpact(input, '- MPL-99: x');
    // then
    expect(drop).toThrow('finding card impact: - MPL-99: x');
  });
});
