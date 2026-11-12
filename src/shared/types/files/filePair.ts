export type FilePair =
  | { kind: 'text'; path: string; current: string | null; base: string | null }
  | { kind: 'binary'; path: string }
  | { kind: 'tooLarge'; path: string; bytes: number };
