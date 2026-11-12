import type { Finding } from '@shared/types/findings/finding';
import type { FindingsFile } from '@shared/types/findings/findingsFile';

export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F1',
    identity: { kind: 'code', class: 'command-injection', file: 'src/main/x.ts', hash: '0123456789abcdef' },
    line: 42,
    severity: 'high',
    sources: ['security-pass'],
    title: 'Branch name reaches a shell',
    what: 'A branch name is put into a shell command.',
    how: 'Someone who names a branch can run commands.',
    impact: 'They could read the Jira token.',
    defense: 'Pass arguments as an array.',
    chips: ['runs-code', 'leaks-credentials'],
    applied: null,
    decision: null,
    severityOverride: null,
    ...overrides,
  };
}

export function findingsFile(findings: Finding[]): FindingsFile {
  return {
    version: 1,
    card: 'MPL-20',
    round: 1,
    headSha: 'a'.repeat(40),
    updatedAt: '2026-11-12T12:00:00.000Z',
    resume: null,
    findings,
  };
}
