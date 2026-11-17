import type { Fetched } from '@shared/types/app/fetched';
import type { FindingsFile } from '@shared/types/findings/findingsFile';
import { finding, findingsFile } from '@renderer/testing/findingsFixture';
import { findingsLabel } from './findingsLabel';

const decided = { kind: 'not-real' as const, reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };

function fetched(file: FindingsFile | null, error: string | null = null): Fetched<FindingsFile> {
  return { data: file, error, fetchedAt: null };
}

describe('findingsLabel', () => {
  test.each([
    {
      name: 'one undecided on a ready dot',
      dot: 'ready' as const,
      findings: fetched(findingsFile([finding()])),
      want: '1 finding needs you',
    },
    {
      name: 'two undecided on a ready dot',
      dot: 'ready' as const,
      findings: fetched(findingsFile([finding(), finding({ id: 'F2' })])),
      want: '2 findings need you',
    },
    {
      name: 'all decided on a ready dot',
      dot: 'ready' as const,
      findings: fetched(findingsFile([finding({ decision: decided }), finding({ id: 'F2', decision: decided })])),
      want: 'Findings (2)',
    },
    {
      name: 'undecided on an idle dot',
      dot: 'idle' as const,
      findings: fetched(findingsFile([finding()])),
      want: 'Findings (1)',
    },
    {
      name: 'undecided on a working dot',
      dot: 'working' as const,
      findings: fetched(findingsFile([finding()])),
      want: 'Findings (1)',
    },
    { name: 'no findings', dot: 'ready' as const, findings: fetched(findingsFile([])), want: null },
    { name: 'no file', dot: 'ready' as const, findings: fetched(null), want: null },
    {
      name: 'a file that cannot be read',
      dot: 'ready' as const,
      findings: fetched(null, 'reading findings: MPL-1.json is from a newer Maple'),
      want: "Findings can't be read",
    },
  ])('reads $want for $name', ({ dot, findings, want }) => {
    // given
    // when
    const got = findingsLabel(dot, findings);
    // then
    expect(got).toBe(want);
  });
});
