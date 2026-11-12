export type UpgradeStep = (raw: Record<string, unknown>) => Record<string, unknown>;

export type Upgraded = { newer: false; raw: Record<string, unknown> } | { newer: true; version: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function upgrade(raw: unknown, current: number, steps: Readonly<Record<number, UpgradeStep>>): Upgraded {
  if (!isRecord(raw)) {
    throw new Error('upgrading: expected an object');
  }
  const version = raw.version ?? 1;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('upgrading: version must be a whole number of 1 or more');
  }
  if (version > current) {
    return { newer: true, version };
  }
  let upgraded = raw;
  for (let from = version; from < current; from += 1) {
    if (!Object.hasOwn(steps, from)) {
      throw new Error(`upgrading: no step from version ${String(from)}`);
    }
    upgraded = steps[from](upgraded);
  }
  return { newer: false, raw: { ...upgraded, version: current } };
}
