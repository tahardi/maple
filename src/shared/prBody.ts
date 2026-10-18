const headingPattern = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

function section(lines: string[], title: string): string | null {
  const start = lines.findIndex((line) => headingPattern.exec(line)?.[2].toLowerCase() === title);
  if (start === -1) {
    return null;
  }
  const level = headingPattern.exec(lines[start])?.[1].length ?? 1;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const hashes = headingPattern.exec(line)?.[1];
    return hashes !== undefined && hashes.length <= level;
  });
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function parsePrBody(body: string): { deviations: string | null; needsTaylor: string | null } {
  const lines = body.split(/\r?\n/);
  return { deviations: section(lines, 'deviations from the card'), needsTaylor: section(lines, 'needs taylor') };
}
