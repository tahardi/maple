import type { FindingDecision } from './findingDecision';
import type { FindingIdentity } from './findingIdentity';
import type { ImpactChip } from './impactChip';

type FindingApplied = { at: string; commit: string | null; cardKey: string | null };

type FindingLesson = { note: string; mode: 'now' | 'later'; at: string };

export type Finding = {
  id: string;
  identity: FindingIdentity;
  line: number | null;
  severity: 'high' | 'medium';
  sources: string[];
  title: string;
  what: string;
  how: string;
  impact: string;
  defense: string;
  chips: ImpactChip[];
  visual?: unknown;
  applied: FindingApplied | null;
  decision: FindingDecision | null;
  severityOverride: 'high' | 'medium' | 'low' | null;
  lesson?: FindingLesson;
};
