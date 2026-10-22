type AdfInline = { type: 'text'; text: string } | { type: 'hardBreak' };

type AdfBlock =
  | { type: 'paragraph'; content: AdfInline[] }
  | { type: 'heading'; attrs: { level: number }; content: AdfInline[] }
  | { type: 'codeBlock'; content: AdfInline[] };

export type AdfDoc = { version: 1; type: 'doc'; content: AdfBlock[] };

const TOKEN_SHAPES = /\b(?:gh[po]_[A-Za-z0-9]+|github_pat_\w+|sk-ant-[\w-]+)/g;

export function logTail(text: string, lines: number, secrets: readonly string[], maxChars = Infinity): string {
  const given = secrets.filter((s) => s !== '');
  const encoded = given.flatMap((a) =>
    given.filter((b) => b !== a).map((b) => Buffer.from(`${a}:${b}`).toString('base64')),
  );
  let tail = text.replace(/\n$/, '').split('\n').slice(-lines).join('\n');
  for (const secret of [...encoded, ...given]) {
    tail = tail.replaceAll(secret, '[redacted]');
  }
  return capChars(tail.replace(TOKEN_SHAPES, '[redacted]'), maxChars);
}

function capChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const cut = text.slice(-maxChars);
  if (text[text.length - maxChars - 1] === '\n') {
    return cut;
  }
  const lineStart = cut.indexOf('\n') + 1;
  return lineStart > 0 && lineStart < cut.length ? cut.slice(lineStart) : cut;
}

export function reportDescription(description: string, log: string | null): AdfDoc {
  const paragraphs: AdfBlock[] = description
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => ({
      type: 'paragraph',
      content: block
        .split('\n')
        .flatMap((line, i): AdfInline[] =>
          i === 0 ? [{ type: 'text', text: line }] : [{ type: 'hardBreak' }, { type: 'text', text: line }],
        ),
    }));
  const logBlocks: AdfBlock[] =
    log === null
      ? []
      : [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Recent log' }] },
          { type: 'codeBlock', content: [{ type: 'text', text: log }] },
        ];
  return { version: 1, type: 'doc', content: [...paragraphs, ...logBlocks] };
}
