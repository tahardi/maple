export type AttackStep = { actor: string; step: string; zone?: string; crosses?: string };

export type FindingVisual = {
  path?: AttackStep[];
  reach?: { now: string[]; afterFix: string[] };
};
