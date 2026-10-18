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
    { name: 'bold', input: doc(paragraph(text('Goal:', { type: 'strong' }))), want: '**Goal:**' },
    {
      name: 'link',
      input: doc(paragraph(text('card', { type: 'link', attrs: { href: 'https://x.test/a' } }))),
      want: '[card](https://x.test/a)',
    },
    { name: 'strikethrough', input: doc(paragraph(text('x', { type: 'strike' }))), want: '~~x~~' },
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
