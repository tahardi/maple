import { describe, expect, test } from 'vitest';
import { findingsSchema } from './findingsSchema';

const base = {
  id: 'F1',
  identity: { kind: 'code', class: 'command-injection', file: 'src/main/x.ts', hash: '0123456789abcdef' },
  line: 42,
  severity: 'high',
  sources: ['security-pass'],
  title: 'Branch name reaches a shell',
  what: 'w',
  how: 'h',
  impact: 'i',
  defense: 'd',
  chips: ['runs-code'],
  applied: null,
  decision: null,
  severityOverride: null,
};

const glance = {
  headline: 'Anyone who names a branch can run commands.',
  attacker: 'anyone who can push a branch',
  likelihood: 'possible',
  fixSize: 'small',
  recommend: { decision: 'fix-now', why: 'One quoted argument closes it.' },
};

function file(finding: Record<string, unknown>) {
  return {
    version: 1,
    card: 'MPL-20',
    round: 1,
    headSha: 'a'.repeat(40),
    updatedAt: '2026-11-12T12:00:00.000Z',
    resume: null,
    findings: [finding],
  };
}

describe('findingsSchema', () => {
  test.each([
    { name: 'all five fields are kept', input: { ...base, ...glance }, want: { ...base, ...glance } },
    {
      name: 'a likelihood of maybe drops only likelihood',
      input: { ...base, ...glance, likelihood: 'maybe' },
      want: { ...base, ...glance, likelihood: undefined },
    },
    {
      name: 'a why of 201 characters drops only recommend',
      input: { ...base, ...glance, recommend: { decision: 'fix-now', why: 'x'.repeat(201) } },
      want: { ...base, ...glance, recommend: undefined },
    },
    {
      name: 'a headline of 161 characters drops only headline',
      input: { ...base, ...glance, headline: 'x'.repeat(161) },
      want: { ...base, ...glance, headline: undefined },
    },
    {
      name: 'an attacker of 61 characters drops only attacker',
      input: { ...base, ...glance, attacker: 'x'.repeat(61) },
      want: { ...base, ...glance, attacker: undefined },
    },
    { name: 'a file without the fields still loads', input: base, want: base },
  ])('$name', ({ input, want }) => {
    // given
    const raw = file(input);
    // when
    const parsed = findingsSchema.parse(raw);
    // then
    expect(parsed.findings[0]).toEqual(want);
  });
});
