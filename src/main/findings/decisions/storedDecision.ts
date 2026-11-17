import type { FindingDecision } from '@shared/types/findings/findingDecision';
import type { FindingIdentity } from '@shared/types/findings/findingIdentity';
import type { Severity } from '@shared/types/findings/severity';

export type StoredDecision = {
  id: string;
  identity: FindingIdentity;
  decision: FindingDecision | null;
  severityOverride: Severity | null;
};
