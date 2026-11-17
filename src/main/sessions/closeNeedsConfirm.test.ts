import { describe, expect, test } from 'vitest';
import type { Dot } from '@shared/types/tabs/dot';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { closeNeedsConfirm } from './closeNeedsConfirm';

function statusOf(tabId: string, dot: Dot): TabStatus {
  return { tabId, dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null };
}

describe('closeNeedsConfirm', () => {
  test.each([
    { name: 'a working tab', statuses: [statusOf('t1', 'working')], force: false, want: true },
    { name: 'a forced close of a working tab', statuses: [statusOf('t1', 'working')], force: true, want: false },
    { name: 'an idle tab', statuses: [statusOf('t1', 'idle')], force: false, want: false },
    { name: 'another working tab', statuses: [statusOf('t2', 'working')], force: false, want: false },
    { name: 'a tab with no status', statuses: [], force: false, want: false },
  ])('returns $want for $name', ({ statuses, force, want }) => {
    // given
    const tabId = 't1';

    // when
    const needed = closeNeedsConfirm(statuses, tabId, force);

    // then
    expect(needed).toBe(want);
  });
});
