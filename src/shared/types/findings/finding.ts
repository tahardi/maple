import type { FindingDecision } from './findingDecision';
import type { FindingIdentity } from './findingIdentity';
import type { FindingVisual } from './findingVisual';
import type { ImpactChip } from './impactChip';
import type { Severity } from './severity';

type FindingApplied = { at: string; commit: string | null; cardKey: string | null };

type FindingLesson = { note: string; mode: 'now' | 'later'; at: string };

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
  visual?: FindingVisual;
  applied: FindingApplied | null;
  decision: FindingDecision | null;
  severityOverride: Severity | null;
  lesson?: FindingLesson;
};
