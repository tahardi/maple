import { describe, expect, test } from 'vitest';
import { adfToMarkdown } from './adf';

function doc(...content: unknown[]): unknown {
  return { type: 'doc', version: 1, content };
}

function text(value: string, ...marks: unknown[]): unknown {
  return marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function paragraph(...content: unknown[]): unknown {
  return { type: 'paragraph', content };
}

function item(...content: unknown[]): unknown {
  return { type: 'listItem', content };
}

describe('adfToMarkdown', () => {
  test.each([
    { name: 'paragraph', input: doc(paragraph(text('hello')), paragraph(text('world'))), want: 'hello\n\nworld' },
    {
      name: 'heading level 2',
      input: doc({ type: 'heading', attrs: { level: 2 }, content: [text('Goal')] }),
      want: '## Goal',
    },
    {
      name: 'bullet list',
      input: doc({ type: 'bulletList', content: [item(paragraph(text('a'))), item(paragraph(text('b')))] }),
      want: '- a\n- b',
    },
    {
      name: 'ordered list',
      input: doc({ type: 'orderedList', content: [item(paragraph(text('a'))), item(paragraph(text('b')))] }),
      want: '1. a\n2. b',
    },
    { name: 'inline code', input: doc(paragraph(text('run '), text('make', { type: 'code' }))), want: 'run `make`' },
    {
      name: 'code block with language',
      input: doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const x = 1;')] }),
      want: '```ts\nconst x = 1;\n```',
    },
    {
      name: 'code block whose text has three backticks in a longer fence',
      input: doc({
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [text('a\n```\n[x](https://evil.example)')],
      }),
      want: '````ts\na\n```\n[x](https://evil.example)\n````',
    },
    {
      name: 'code block whose text has a single backtick in a three-backtick fence',
      input: doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [text('x = `y`')] }),
      want: '```ts\nx = `y`\n```',
    },
    {
      name: 'code block with an unsafe language label dropped',
      input: doc({ type: 'codeBlock', attrs: { language: 'ts\n[x](https://evil.example)' }, content: [text('a')] }),
      want: '```\na\n```',
    },
    {
      name: 'code block whose longest backtick run is not the first',
      input: doc({ type: 'codeBlock', content: [text('````\n`')] }),
      want: '`````\n````\n`\n`````',
    },
    {
      name: 'code block with a backtick run split across text nodes',
      input: doc({ type: 'codeBlock', content: [text('``'), text('`')] }),
      want: '````\n```\n````',
    },
    {
      name: 'code block with very many backtick runs',
      input: doc({ type: 'codeBlock', content: [text('` '.repeat(500_000))] }),
      want: `\`\`\`\n${'` '.repeat(500_000)}\n\`\`\``,
    },
    {
      name: 'code block without a language',
      input: doc({ type: 'codeBlock', content: [text('a')] }),
      want: '```\na\n```',
    },
    {
      name: 'code block keeps a label with every allowed punctuation mark',
      input: doc({ type: 'codeBlock', attrs: { language: 'a+b#c.d-e' }, content: [text('x')] }),
      want: '```a+b#c.d-e\nx\n```',
    },
    {
      name: 'code block with a backtick in its label dropped',
      input: doc({ type: 'codeBlock', attrs: { language: 'ts`' }, content: [text('a')] }),
      want: '```\na\n```',
    },
    {
      name: 'code block with a space in its label dropped',
      input: doc({ type: 'codeBlock', attrs: { language: 'ts title' }, content: [text('a')] }),
      want: '```\na\n```',
    },
    {
      name: 'code block with a longer fence in a list item',
      input: doc({ type: 'bulletList', content: [item({ type: 'codeBlock', content: [text('a\n```')] })] }),
      want: '- ````\n  a\n  ```\n  ````',
    },
    {
      name: 'code block with a longer fence in a blockquote',
      input: doc({ type: 'blockquote', content: [{ type: 'codeBlock', content: [text('a\n```')] }] }),
      want: '> ````\n> a\n> ```\n> ````',
    },
    { name: 'bold', input: doc(paragraph(text('Goal:', { type: 'strong' }))), want: '**Goal:**' },
    {
      name: 'link',
      input: doc(paragraph(text('card', { type: 'link', attrs: { href: 'https://x.test/a' } }))),
      want: '[card](https://x.test/a)',
    },
    { name: 'strikethrough', input: doc(paragraph(text('x', { type: 'strike' }))), want: '~~x~~' },
    { name: 'italic', input: doc(paragraph(text('x', { type: 'em' }))), want: '*x*' },
    {
      name: 'hard break',
      input: doc(paragraph(text('a'), { type: 'hardBreak' }, text('b'))),
      want: 'a\nb',
    },
    {
      name: 'ordered list with a start number',
      input: doc({ type: 'orderedList', attrs: { order: 3 }, content: [item(paragraph(text('a')))] }),
      want: '3. a',
    },
    {
      name: 'nested bullet list',
      input: doc({
        type: 'bulletList',
        content: [item(paragraph(text('a')), { type: 'bulletList', content: [item(paragraph(text('b')))] })],
      }),
      want: '- a\n  - b',
    },
    { name: 'input that is not a document', input: 'not adf', want: '' },
    {
      name: 'unknown node type',
      input: doc({ type: 'panel', content: [paragraph(text('kept'))] }),
      want: 'kept',
    },
  ])('converts $name', ({ input, want }) => {
    // given
    const adf = input;
    // when
    const got = adfToMarkdown(adf);
    // then
    expect(got).toBe(want);
  });
});
