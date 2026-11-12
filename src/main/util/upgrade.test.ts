import { describe, expect, test } from 'vitest';
import { upgrade, type UpgradeStep } from './upgrade';

const steps: Record<number, UpgradeStep> = {
  1: (raw) => ({ ...raw, a: true }),
  2: (raw) => ({ ...raw, b: raw.a === true }),
};

describe('upgrade', () => {
  test.each([
    {
      name: 'a missing version upgraded from 1',
      raw: {},
      expected: { newer: false, raw: { a: true, b: true, version: 3 } },
    },
    {
      name: 'version 2 upgraded by the last step only',
      raw: { version: 2 },
      expected: { newer: false, raw: { b: false, version: 3 } },
    },
    {
      name: 'a current file unchanged',
      raw: { version: 3, c: 1 },
      expected: { newer: false, raw: { version: 3, c: 1 } },
    },
    { name: 'a newer version', raw: { version: 4 }, expected: { newer: true, version: 4 } },
  ])('returns $name', ({ raw, expected }) => {
    // given
    const current = 3;
    // when
    const result = upgrade(raw, current, steps);
    // then
    expect(result).toEqual(expected);
  });

  test.each([
    { name: 'a non-object', raw: [], steps, error: 'upgrading: expected an object' },
    { name: 'null', raw: null, steps, error: 'upgrading: expected an object' },
    {
      name: 'a text version',
      raw: { version: 'x' },
      steps,
      error: 'upgrading: version must be a whole number of 1 or more',
    },
    { name: 'version 0', raw: { version: 0 }, steps, error: 'upgrading: version must be a whole number of 1 or more' },
    {
      name: 'version 1.5',
      raw: { version: 1.5 },
      steps,
      error: 'upgrading: version must be a whole number of 1 or more',
    },
    {
      name: 'a missing step',
      raw: { version: 1 },
      steps: { 2: (raw: Record<string, unknown>) => raw },
      error: 'upgrading: no step from version 1',
    },
  ])('throws for $name', ({ raw, steps: given, error }) => {
    // given
    const current = 3;
    // when
    const run = () => upgrade(raw, current, given);
    // then
    expect(run).toThrow(error);
  });
});
