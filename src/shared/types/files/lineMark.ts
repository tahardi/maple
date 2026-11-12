export type LineMark =
  | { kind: 'add'; line: number }
  | { kind: 'chg'; line: number; oldText: string | null }
  | { kind: 'del'; afterLine: number; oldText: string };
