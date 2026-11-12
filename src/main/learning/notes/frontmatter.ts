import { isMap, isScalar, parseDocument, stringify, type Document } from 'yaml';

const BLOCK = /^---\r?\n((?:[\s\S]*?\r?\n)?)---[ \t]*(?:\r?\n|$)/;

function split(text: string): { block: string | null; body: string } {
  const match = BLOCK.exec(text);
  return match === null ? { block: null, body: text } : { block: match[1], body: text.slice(match[0].length) };
}

function parse(block: string, verb: 'reading' | 'writing'): Document {
  const doc = parseDocument(block);
  if (doc.errors.length > 0) {
    throw new Error(`${verb} frontmatter: ${doc.errors[0].message}`);
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new Error(`${verb} frontmatter: the block is not a map`);
  }
  return doc;
}

export function readFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const { block, body } = split(text);
  if (block === null) {
    return { data: {}, body };
  }
  const data: unknown = parse(block, 'reading').toJS();
  return { data: data === null ? {} : (data as Record<string, unknown>), body };
}

function isPlainValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function editBlock(block: string, fields: Record<string, unknown>): string {
  const doc = parse(block, 'writing');
  const map = isMap(doc.contents) ? doc.contents : null;
  const edits: { start: number; end: number; text: string }[] = [];
  const added: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const pair = map?.items.find((p) => isScalar(p.key) && p.key.value === key);
    const node = pair?.value;
    if (!isPlainValue(value)) {
      return reprint(doc, fields);
    }
    if (pair === undefined) {
      added.push(stringify({ [key]: value }));
      continue;
    }
    if (!isScalar(node) || node.range == null) {
      return reprint(doc, fields);
    }
    const [start, end] = node.range;
    const lead = block[start - 1] === ':' ? ' ' : '';
    edits.push({ start, end, text: lead + stringify(value).trimEnd() });
  }
  const edited = edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), block);
  return edited + added.join('');
}

function reprint(doc: Document, fields: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(fields)) {
    doc.set(key, value);
  }
  return doc.toString();
}

export function writeFrontmatter(text: string, fields: Record<string, unknown>): string {
  const { block, body } = split(text);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const edited = editBlock(block ?? '', fields).replace(/\r?\n/g, newline);
  return `---${newline}${edited}---${newline}${body}`;
}
