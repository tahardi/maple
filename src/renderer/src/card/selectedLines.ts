export type Lines = { start: number; end: number };

type Selection = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };

export function selectedLines(selection: Selection): Lines {
  const { startLineNumber: start, endLineNumber, endColumn } = selection;
  return { start, end: endLineNumber > start && endColumn === 1 ? endLineNumber - 1 : endLineNumber };
}

export function linesLabel({ start, end }: Lines): string {
  return start === end ? `line ${String(start)}` : `lines ${String(start)}-${String(end)}`;
}
