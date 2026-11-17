export type FindingIdentity =
  | { kind: 'code'; class: string; file: string; hash: string }
  | { kind: 'dependency'; advisory: string; package: string };
