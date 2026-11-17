import type { FindingDecision } from './findingDecision';
import type { FindingIdentity } from './findingIdentity';
import type { FindingLesson } from './findingLesson';
import type { FindingVisual } from './findingVisual';
import type { FixSize } from './fixSize';
import type { ImpactChip } from './impactChip';
import type { Likelihood } from './likelihood';
import type { Recommendation } from './recommendation';
import type { Severity } from './severity';

type FindingApplied = { at: string; commit: string | null; cardKey: string | null };

export type Finding = {
  id: string;
  identity: FindingIdentity;
  line: number | null;
  severity: Exclude<Severity, 'low'>;
  sources: string[];
  title: string;
  what: string;
  how: string;
  impact: string;
  defense: string;
  chips: ImpactChip[];
  headline?: string;
  attacker?: string;
  likelihood?: Likelihood;
  fixSize?: FixSize;
  recommend?: Recommendation;
  visual?: FindingVisual;
  applied: FindingApplied | null;
  decision: FindingDecision | null;
  severityOverride: Severity | null;
  lesson?: FindingLesson;
};
