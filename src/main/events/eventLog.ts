import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { z } from 'zod';
import {
  eventEnvelopeSchema,
  eventSchemas,
  type EventFilter,
  type EventRecord,
  type EventRefs,
  type EventSchemas,
} from '@shared/types/events';
import { configDir } from '@main/app/config';
import { appLogger, logFailure, redact, type Logger } from '@main/app/log';
import { closeTornLine } from './closeTornLine';
import { dayFiles } from './dayFiles';
import { dayName } from './dayName';
import { KEEP_DAYS, pruneEvents, type PruneLimits } from './pruneEvents';

export type EventLog<S extends EventSchemas> = {
  append<T extends keyof S & string>(type: T, refs: EventRefs, data: z.input<S[T]>): Promise<void>;
  readEvents(filter: EventFilter): Promise<EventRecord[]>;
};

export function eventsDir(): string {
  return join(configDir(), 'events');
}

function parseLine(line: string): EventRecord | null {
  try {
    const parsed = eventEnvelopeSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function matches(record: EventRecord, filter: EventFilter): boolean {
  const at = Date.parse(record.at);
  return (
    at >= Date.parse(filter.from) &&
    at <= Date.parse(filter.to) &&
    (filter.card === undefined || record.card === filter.card) &&
    (filter.session === undefined || record.session === filter.session) &&
    (filter.types === undefined || filter.types.includes(record.type))
  );
}

type PruneOptions = { limits?: PruneLimits; askDeleteToday?: (bytes: number) => Promise<boolean> };

export function createEventLog<S extends EventSchemas = typeof eventSchemas>(
  options: PruneOptions & { schemas?: S; dir?: string; now?: () => Date; uuid?: () => string; logger?: Logger } = {},
): EventLog<S> {
  const schemas = options.schemas ?? (eventSchemas as EventSchemas as S);
  const dir = options.dir ?? eventsDir();
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  const logger = options.logger ?? appLogger;

  const prune = async (): Promise<void> => {
    const deleted = await pruneEvents(dir, now(), options.limits, options.askDeleteToday);
    if (deleted.length > 0) {
      logger.info('events', 'pruned', { deleted });
    }
  };
  const attempt = (operation: string, run: () => Promise<void>): Promise<void> =>
    logFailure(logger, 'events', { operation }, run).catch(() => undefined);
  const startup = async (): Promise<void> => {
    await logFailure(logger, 'events', { operation: 'createEventsDir' }, () => mkdir(dir, { recursive: true }));
    await attempt('pruneEvents', prune);
    await attempt('closeTornLine', () => closeTornLine(join(dir, `${dayName(now())}.jsonl`)));
  };

  let queue: Promise<void> = startup().catch(() => undefined);

  return {
    async append(type, refs, data) {
      const parsed = schemas[type].safeParse(data);
      if (!parsed.success) {
        throw new Error(`recording event ${type}: data does not match its schema`);
      }
      const at = now();
      const record: EventRecord = {
        v: 1,
        id: uuid(),
        at: at.toISOString(),
        type,
        project: refs.project,
        card: refs.card,
        tab: refs.tab,
        session: refs.session,
        data: redact(parsed.data),
      };
      const path = join(dir, `${dayName(at)}.jsonl`);
      queue = queue.catch(() => undefined).then(() => appendFile(path, JSON.stringify(record) + '\n'));
      await queue;
    },
    async readEvents(filter) {
      await queue.catch(() => undefined);
      const first = `${dayName(new Date(filter.from))}.jsonl`;
      const last = `${dayName(new Date(filter.to))}.jsonl`;
      const names = (await dayFiles(dir)).filter((name) => name >= first && name <= last);
      const records: EventRecord[] = [];
      for (const name of names) {
        const lines = createInterface({ input: createReadStream(join(dir, name)), crlfDelay: Infinity });
        for await (const line of lines) {
          const record = parseLine(line);
          if (record && matches(record, filter)) {
            records.push(record);
          }
        }
      }
      return records;
    },
  };
}

let current: EventLog<typeof eventSchemas> | null = null;
let keepDays = KEEP_DAYS;

export function startEventLog(options: PruneOptions = {}): EventLog<typeof eventSchemas> {
  if (!current) {
    keepDays = options.limits?.keepDays ?? KEEP_DAYS;
    current = createEventLog(options);
  }
  return current;
}

export function eventKeepDays(): number {
  return keepDays;
}

export function eventLog(): EventLog<typeof eventSchemas> {
  if (!current) {
    throw new Error('reading event log: the event log is not started');
  }
  return current;
}
