import type { FindingIdentity } from '@shared/types/findings/findingIdentity';

export function lessonClass(identity: FindingIdentity): string {
  return identity.kind === 'code' ? identity.class : 'vulnerable-dependency';
}
