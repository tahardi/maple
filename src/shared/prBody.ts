const headingPattern = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

type Item = { start: number; end: number; text: string };

function sectionRange(lines: string[], title: string): { start: number; end: number } | null {
  const heading = lines.findIndex((line) => headingPattern.exec(line)?.[2].toLowerCase() === title);
  if (heading === -1) {
    return null;
  }
  const level = headingPattern.exec(lines[heading])?.[1].length ?? 1;
  const next = lines.findIndex((line, i) => {
    const hashes = headingPattern.exec(line)?.[1];
    return i > heading && hashes !== undefined && hashes.length <= level;
  });
  return { start: heading + 1, end: next === -1 ? lines.length : next };
}

function section(lines: string[], title: string): string | null {
  const range = sectionRange(lines, title);
  return range === null ? null : lines.slice(range.start, range.end).join('\n').trim();
}

function items(lines: string[], start: number, end: number): Item[] {
  const found: Item[] = [];
  for (let i = start; i < end; i++) {
    if (!lines[i].startsWith('- ')) {
      continue;
    }
    let j = i + 1;
    while (j < end && /^\s/.test(lines[j])) {
      j++;
    }
    found.push({ start: i, end: j, text: lines.slice(i, j).join('\n') });
    i = j - 1;
  }
  return found;
}

export function parsePrBody(body: string): {
  deviations: string | null;
  needsTaylor: string | null;
  cardImpacts: string | null;
} {
  const lines = body.split(/\r?\n/);
  return {
    deviations: section(lines, 'deviations from the card'),
    needsTaylor: section(lines, 'needs taylor'),
    cardImpacts: section(lines, 'card impacts'),
  };
}

export function impactItems(cardImpacts: string | null): string[] {
  const lines = (cardImpacts ?? '').split(/\r?\n/);
  return items(lines, 0, lines.length).map((item) => item.text);
}

export function dropImpact(body: string, item: string): string {
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  const range = sectionRange(lines, 'card impacts');
  const found = range === null ? [] : items(lines, range.start, range.end);
  const target = found.find((f) => f.text === item.replace(/\r\n/g, '\n'));
  if (target === undefined) {
    throw new Error(`finding card impact: ${item}`);
  }
  lines.splice(target.start, target.end - target.start, ...(found.length === 1 ? ['None'] : []));
  return lines.join(eol);
}
