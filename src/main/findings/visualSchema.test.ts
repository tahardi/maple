import { describe, expect, test } from 'vitest';
import { visualSchema } from './visualSchema';

const reach = { now: ['Run commands.'], afterFix: [] };

describe('visualSchema', () => {
  test.each([
    {
      name: 'a step with zone and crosses keeps both',
      input: {
        path: [
          { actor: 'a session', step: 'Rewrites the file.', zone: 'Claude sessions' },
          { actor: 'Maple', step: 'Reads the file.', zone: 'Maple app', crosses: 'the rewritten file' },
        ],
      },
      want: {
        path: [
          { actor: 'a session', step: 'Rewrites the file.', zone: 'Claude sessions' },
          { actor: 'Maple', step: 'Reads the file.', zone: 'Maple app', crosses: 'the rewritten file' },
        ],
      },
    },
    {
      name: 'a zone of 41 characters drops the path',
      input: {
        path: [
          { actor: 'a session', step: 'Rewrites the file.', zone: 'x'.repeat(41) },
          { actor: 'Maple', step: 'Reads the file.', zone: 'Maple app' },
        ],
        reach,
      },
      want: { reach },
    },
    {
      name: 'a crosses of 61 characters drops the path',
      input: {
        path: [
          { actor: 'a session', step: 'Rewrites the file.', zone: 'Claude sessions' },
          { actor: 'Maple', step: 'Reads the file.', zone: 'Maple app', crosses: 'x'.repeat(61) },
        ],
        reach,
      },
      want: { reach },
    },
    {
      name: 'a path that returns to a zone it left drops the path',
      input: {
        path: [
          { actor: 'a', step: 'One.', zone: 'A' },
          { actor: 'b', step: 'Two.', zone: 'B' },
          { actor: 'c', step: 'Three.', zone: 'A' },
        ],
        reach,
      },
      want: { reach },
    },
    {
      name: 'a path with four zones drops the path',
      input: {
        path: ['A', 'B', 'C', 'D'].map((zone) => ({ actor: 'a', step: 'Goes.', zone })),
        reach,
      },
      want: { reach },
    },
    {
      name: 'a path with three zones in groups keeps the path',
      input: {
        path: ['A', 'A', 'B', 'C', 'C'].map((zone) => ({ actor: 'a', step: 'Goes.', zone })),
      },
      want: {
        path: ['A', 'A', 'B', 'C', 'C'].map((zone) => ({ actor: 'a', step: 'Goes.', zone })),
      },
    },
    {
      name: 'a visual with only map parses to undefined',
      input: { map: { zones: ['a', 'b'], from: 'a', to: 'b' } },
      want: undefined,
    },
    {
      name: 'a visual with map and reach keeps reach only',
      input: { map: { zones: ['a', 'b'], from: 'a', to: 'b' }, reach },
      want: { reach },
    },
  ])('$name', ({ input, want }) => {
    // given
    // when
    const got = visualSchema.parse(input);
    // then
    expect(got).toEqual(want);
  });
});
