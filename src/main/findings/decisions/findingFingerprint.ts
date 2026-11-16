import { createHash } from 'node:crypto';
import type { Finding } from '@shared/types/findings/finding';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function findingFingerprint(finding: Finding): string {
  const judged = {
    severity: finding.severity,
    title: finding.title,
    headline: finding.headline ?? null,
    what: finding.what,
    how: finding.how,
    impact: finding.impact,
    defense: finding.defense,
    chips: finding.chips,
    visual: finding.visual ?? null,
  };
  return createHash('sha256').update(canonicalJson(judged), 'utf8').digest('hex');
}
