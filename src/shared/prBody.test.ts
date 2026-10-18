import { describe, expect, test } from 'vitest';
import { parsePrBody } from './prBody';

describe('parsePrBody', () => {
  test.each([
    {
      name: 'level 2 headings',
      body: '## Deviations from the card\nNone\n\n## Needs Taylor\n- Try it on device\n',
      expected: { deviations: 'None', needsTaylor: '- Try it on device' },
    },
    {
      name: 'level 3 headings',
      body: '### Deviations from the card\nNone\n\n### Needs Taylor\n- Try it on device\n',
      expected: { deviations: 'None', needsTaylor: '- Try it on device' },
    },
    {
      name: 'headings in a different case',
      body: '## deviations FROM the card\nNone\n\n## needs taylor\n- Try it on device\n',
      expected: { deviations: 'None', needsTaylor: '- Try it on device' },
    },
    {
      name: 'Windows line endings',
      body: '## Deviations from the card\r\nNone\r\n\r\n## Needs Taylor\r\n- One\r\n- Two\r\n',
      expected: { deviations: 'None', needsTaylor: '- One\n- Two' },
    },
    {
      name: 'both sections missing',
      body: '## Describe your changes\nStuff\n',
      expected: { deviations: null, needsTaylor: null },
    },
    {
      name: 'section ending at the next heading of the same or higher level',
      body: '## Needs Taylor\n- One\n### Detail\n- Two\n# Other\nignored\n## Deviations from the card\nA\n## Next\nB\n',
      expected: { deviations: 'A', needsTaylor: '- One\n### Detail\n- Two' },
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
