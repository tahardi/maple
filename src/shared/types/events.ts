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

export type EventFilter = {
  from: string;
  to: string;
  card?: string;
  session?: string;
  types?: readonly string[];
};

export type EventSchemas = Record<string, z.ZodObject>;

const transcriptSchema = z.object({ session: z.string(), offset: z.number() }).nullable();

export const eventSchemas = {
  'session.spawn': z.object({ prompted: z.boolean(), resumed: z.boolean() }),
  'session.exit': z.object({ exitCode: z.number() }),
  'session.interrupt': z.object({}),
  'session.resumeFailed': z.object({ exitCode: z.number().nullable() }),
  'prompt.submitted': z.object({}),
  'permission.prompt': z.object({}),
  'session.stop': z.object({
    transcript: transcriptSchema,
    head: z.string().nullable(),
    backgroundTasks: z.array(z.string()),
  }),
  'session.start': z.object({ source: z.string().nullable(), transcript: transcriptSchema }),
} satisfies EventSchemas;
