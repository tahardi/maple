import { z } from 'zod';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { IMPACT_CHIPS, type ImpactChip } from '@shared/types/findings/impactChip';

const prose = z.string().max(2000);
const time = z.string().max(100);

function isChip(chip: string): chip is ImpactChip {
  return (IMPACT_CHIPS as readonly string[]).includes(chip);
}

const identity = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('code'),
    class: z.string().max(200),
    file: z.string().max(4096),
    hash: z.string().max(64),
  }),
  z.object({ kind: z.literal('dependency'), advisory: z.string().max(200), package: z.string().max(400) }),
]);

const finding = z.object({
  id: z.string().max(20),
  identity,
  line: z.number().int().min(1).nullable(),
  severity: z.enum(['high', 'medium']),
  sources: z.array(z.string().max(100)).max(20),
  title: prose,
  what: prose,
  how: prose,
  impact: prose,
  defense: prose,
  chips: z
    .array(z.string())
    .max(20)
    .transform((chips) => chips.filter(isChip)),
  visual: z.unknown().optional(),
  applied: z
    .object({ at: time, commit: z.string().max(64).nullable(), cardKey: z.string().max(40).nullable() })
    .nullable(),
  decision: z
    .object({
      kind: z.enum(['fix-now', 'fix-later', 'accept-risk', 'not-real']),
      reason: prose.nullable(),
      decidedAt: time,
    })
    .nullable(),
  severityOverride: z.enum(['high', 'medium', 'low']).nullable(),
  lesson: z.object({ note: z.string().max(4096), mode: z.enum(['now', 'later']), at: time }).optional(),
});

export const findingsSchema: z.ZodType<FindingsFile> = z.object({
  version: z.literal(1),
  card: z.string().max(40),
  round: z.number().int().min(0),
  headSha: z.string().max(64),
  updatedAt: time,
  resume: z.object({ round: z.number().int().min(0), sentAt: time }).nullable(),
  findings: z.array(finding).max(500),
});
