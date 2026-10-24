import { namedNotes } from './namedNotes';

describe('namedNotes', () => {
  test.each([
    {
      name: 'finds a backticked path',
      description: 'Output: a new vault note `TEE/Attestation/NVIDIA GPU.md`',
      paths: ['Inbox.md', 'TEE/Attestation/NVIDIA GPU.md'],
      want: ['TEE/Attestation/NVIDIA GPU.md'],
    },
    {
      name: 'finds a bare path with spaces',
      description: 'A new section in TEE/Trusted Time Literature Review.md',
      paths: ['TEE/Trusted Time Literature Review.md'],
      want: ['TEE/Trusted Time Literature Review.md'],
    },
    {
      name: 'skips a named path that is not in the vault',
      description: 'Record it in `docs/decisions/x.md`',
      paths: ['Inbox.md'],
      want: [],
    },
    {
      name: 'skips a note whose path ends another named path',
      description: 'Update `Projects/Maple/Notes.md`',
      paths: ['Notes.md', 'Projects/Maple/Notes.md'],
      want: ['Projects/Maple/Notes.md'],
    },
    {
      name: 'skips a note whose path starts another named path',
      description: 'Update TEE/Trusted Time Literature Review.md',
      paths: ['TEE/Trusted Time.md', 'TEE/Trusted Time Literature Review.md'],
      want: ['TEE/Trusted Time Literature Review.md'],
    },
    {
      name: 'finds a path named on its own after it appears inside another path',
      description: 'Update `Projects/Maple/Notes.md`, then Notes.md',
      paths: ['Notes.md', 'Projects/Maple/Notes.md'],
      want: ['Notes.md', 'Projects/Maple/Notes.md'],
    },
    {
      name: 'finds a path after Plan in the middle of a line',
      description: 'See Plan: `Projects/Maple/Roadmap.md`',
      paths: ['Projects/Maple/Roadmap.md'],
      want: ['Projects/Maple/Roadmap.md'],
    },
    {
      name: 'ignores a path on a Plan line',
      description: 'Plan: Projects/Maple/Roadmap.md',
      paths: ['Projects/Maple/Roadmap.md'],
      want: [],
    },
    {
      name: 'ignores a path on a bold Plan line',
      description: '  **Plan:** `Projects/Maple/Roadmap.md`',
      paths: ['Projects/Maple/Roadmap.md'],
      want: [],
    },
    {
      name: 'finds a path on another line than the Plan line',
      description: '**Plan:** `Projects/Maple/Roadmap.md`\nOutput: `Projects/Maple/Roadmap.md`',
      paths: ['Projects/Maple/Roadmap.md'],
      want: ['Projects/Maple/Roadmap.md'],
    },
    {
      name: 'returns a note named twice once',
      description: 'Write `Spike.md`, then link Spike.md',
      paths: ['Spike.md'],
      want: ['Spike.md'],
    },
    {
      name: 'returns nothing for an empty description',
      description: '',
      paths: ['Spike.md'],
      want: [],
    },
    {
      name: 'keeps the order of the vault listing',
      description: 'Write `B.md` and `A.md`',
      paths: ['A.md', 'B.md'],
      want: ['A.md', 'B.md'],
    },
  ])('$name', ({ description, paths, want }) => {
    // given
    const listing: readonly string[] = paths;
    // when
    const got = namedNotes(description, listing);
    // then
    expect(got).toEqual(want);
  });
});
