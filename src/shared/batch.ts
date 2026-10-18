const MARKER = 'MAPLE-BATCH:';
const CARD_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export function parseBatch(text: string): string[] | null {
  const line = text.split('\n').findLast((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) {
    return null;
  }
  const rest = line.slice(MARKER.length).trim();
  if (rest === 'none') {
    return [];
  }
  const keys = rest.split(',').map((key) => key.trim());
  return keys.every((key) => CARD_KEY.test(key)) ? keys : null;
}
