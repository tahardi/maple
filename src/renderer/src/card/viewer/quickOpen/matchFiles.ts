const LIMIT = 50;

function inOrder(text: string, query: string): boolean {
  let at = 0;
  for (const char of text) {
    if (char === query[at]) {
      at++;
    }
    if (at === query.length) {
      return true;
    }
  }
  return at === query.length;
}

export function matchFiles(files: readonly string[], query: string): string[] {
  const needle = query.toLowerCase();
  if (needle === '') {
    return files.slice(0, LIMIT);
  }
  const inName: string[] = [];
  const inPath: string[] = [];
  for (const file of files) {
    const path = file.toLowerCase();
    if (inOrder(path.slice(path.lastIndexOf('/') + 1), needle)) {
      inName.push(file);
    } else if (inOrder(path, needle)) {
      inPath.push(file);
    }
  }
  return [...inName, ...inPath].slice(0, LIMIT);
}
