export type AttackStep = { actor: string; step: string };

export type TrustCrossing = { zones: string[]; from: string; to: string };

export type FindingVisual = {
  path?: AttackStep[];
  map?: TrustCrossing;
  reach?: { now: string[]; afterFix: string[] };
};
