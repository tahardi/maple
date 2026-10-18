import { z } from 'zod';

const markSchema = z.object({ type: z.string(), attrs: z.record(z.string(), z.unknown()).optional() });

const nodeSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  marks: z.array(markSchema).optional(),
  get content() {
    return z.array(nodeSchema).optional();
  },
});

type AdfNode = z.infer<typeof nodeSchema>;
type AdfMark = z.infer<typeof markSchema>;

const INLINE_PARENTS = new Set(['paragraph', 'heading', 'codeBlock']);

export function adfToMarkdown(doc: unknown): string {
  const parsed = nodeSchema.safeParse(doc);
  return parsed.success ? render(parsed.data) : '';
}

function render(node: AdfNode): string {
  const children = node.content ?? [];
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks ?? []);
    case 'hardBreak':
      return '\n';
    case 'paragraph':
      return inline(children);
    case 'heading':
      return `${'#'.repeat(numberAttr(node, 'level', 1))} ${inline(children)}`;
    case 'codeBlock':
      return `\`\`\`${stringAttr(node, 'language')}\n${inline(children)}\n\`\`\``;
    case 'bulletList':
      return children.map((item) => listItem(item, '- ')).join('\n');
    case 'orderedList': {
      const start = numberAttr(node, 'order', 1);
      return children.map((item, i) => listItem(item, `${String(start + i)}. `)).join('\n');
    }
    case 'blockquote':
      return blocks(children)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'rule':
      return '---';
    default:
      if (children.length > 0) {
        return INLINE_PARENTS.has(node.type) ? inline(children) : blocks(children);
      }
      return stringAttr(node, 'text') || stringAttr(node, 'url');
  }
}

function inline(nodes: AdfNode[]): string {
  return nodes.map(render).join('');
}

function blocks(nodes: AdfNode[]): string {
  return nodes.map(render).join('\n\n');
}

function listItem(item: AdfNode, prefix: string): string {
  const body = (item.content ?? []).map(render).join('\n');
  const pad = ' '.repeat(prefix.length);
  return prefix + body.split('\n').join(`\n${pad}`);
}

function applyMarks(text: string, marks: AdfMark[]): string {
  const has = (type: string): AdfMark | undefined => marks.find((m) => m.type === type);
  let out = text;
  if (has('code')) out = `\`${out}\``;
  if (has('em')) out = `*${out}*`;
  if (has('strong')) out = `**${out}**`;
  if (has('strike')) out = `~~${out}~~`;
  const link = has('link');
  const href = link?.attrs?.href;
  if (typeof href === 'string') out = `[${out}](${href})`;
  return out;
}

function numberAttr(node: AdfNode, key: string, fallback: number): number {
  const value = node.attrs?.[key];
  return typeof value === 'number' ? value : fallback;
}

function stringAttr(node: AdfNode, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : '';
}
