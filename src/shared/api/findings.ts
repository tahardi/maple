import type { ChannelKind } from './mapleApi';
import type { Fetched } from '../types/app/fetched';
import type { Unsubscribe } from '../types/app/unsubscribe';
import type { DecisionInput } from '../types/findings/decisionInput';
import type { FindingsFile } from '../types/findings/findingsFile';
import type { Severity } from '../types/findings/severity';

export type FindingsApi = {
  get(tabId: string): Promise<Fetched<FindingsFile>>;
  decide(tabId: string, findingId: string, decision: DecisionInput | null): Promise<void>;
  override(tabId: string, findingId: string, severity: Severity | null): Promise<void>;
  onChanged(cb: () => void): Unsubscribe;
};

export const FINDINGS_CHANNELS = {
  get: 'invoke',
  decide: 'invoke',
  override: 'invoke',
  onChanged: 'event',
} as const satisfies { [M in keyof FindingsApi]: ChannelKind };
