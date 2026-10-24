const PLAN_LINE = /^[\s*]*Plan:/;
const PATH_CHAR = /[A-Za-z0-9_./-]/;

function names(text: string, path: string): boolean {
  for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
    if (at === 0 || !PATH_CHAR.test(text[at - 1])) {
      return true;
    }
  }
  return false;
}

export function namedNotes(description: string, paths: readonly string[]): string[] {
  const text = description
    .split('\n')
    .filter((line) => !PLAN_LINE.test(line))
    .join('\n');
  return paths.filter((path) => names(text, path));
}
