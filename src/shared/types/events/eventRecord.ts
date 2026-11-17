import { z } from 'zod';

export const eventEnvelopeSchema = z.object({
  v: z.literal(1),
  id: z.uuid(),
  at: z.iso.datetime({ precision: 3 }),
  type: z.string(),
  project: z.string().nullable(),
  card: z.string().nullable(),
  tab: z.string().nullable(),
  session: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});

export type EventRecord = z.infer<typeof eventEnvelopeSchema>;

export type EventRefs = Pick<EventRecord, 'project' | 'card' | 'tab' | 'session'>;
