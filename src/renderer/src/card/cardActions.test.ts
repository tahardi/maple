import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { PrInfo } from '@shared/types/github/prInfo';
import { cardActions } from './cardActions';

const config: MapleConfig = {
  worktreesDir: '/tmp/wts',
  vaultDir: null,
  notifications: false,
  backgroundWaitMinutes: 15,
  eventKeepDays: 365,
  eventMaxMegabytes: 200,
  stateBackups: 3,
  startAtOnce: 4,
  startGapSeconds: 90,
  maxWorking: 8,
  maxLoadPerCore: 0.8,
  minFreeMegabytes: 2048,
  projects: [],
  actions: [
    { label: 'Address review', prompt: '/card {key}' },
    { label: 'Merge main', prompt: 'Run the "Sync with Main" steps from the /card skill for {key}.' },
  ],
};

const pr: PrInfo = {
  number: 7,
  url: 'https://github.com/tahardi/dig-days/pull/7',
  title: '[DIG-44] Trail Map',
  state: 'OPEN',
  deviations: null,
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  checks: { passed: 3, failed: 0, pending: 0, total: 3, runs: [] },
};

type Overrides = { pr?: PrInfo | null; worktreeExists?: boolean };

function actions(overrides: Overrides = {}) {
  const send = vi.fn();
  const list = cardActions({
    config,
    cardKey: 'DIG-44',
    pr: overrides.pr === undefined ? pr : overrides.pr,
    worktreeExists: overrides.worktreeExists ?? true,
    send,
  });
  return { list, send };
}

describe('cardActions', () => {
  test('gives one button per config action', () => {
    // given
    const { list } = actions();
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Address review', 'Merge main']);
    expect(list.every((a) => !a.disabled)).toBe(true);
  });

  test.each([
    { label: 'Address review', want: '/card DIG-44' },
    { label: 'Merge main', want: 'Run the "Sync with Main" steps from the /card skill for DIG-44.' },
  ])('$label sends its filled prompt', ({ label, want }) => {
    // given
    const { list, send } = actions();
    // when
    list.find((a) => a.label === label)?.onClick();
    // then
    expect(send).toHaveBeenCalledWith(want);
  });

  test('without a worktree every button is disabled and says No worktree', () => {
    // given
    const { list } = actions({ worktreeExists: false });
    // when
    const states = list.map((a) => ({ disabled: a.disabled, reason: a.reason }));
    // then
    expect(states).toEqual([
      { disabled: true, reason: 'No worktree' },
      { disabled: true, reason: 'No worktree' },
    ]);
  });

  test.each([
    { name: 'the PR number', pr, want: 'Review PR 7 for DIG-44' },
    { name: 'nothing without a PR', pr: null, want: 'Review PR  for DIG-44' },
  ])('fills {pr} with $name', ({ pr: withPr, want }) => {
    // given
    const send = vi.fn();
    const list = cardActions({
      config: { ...config, actions: [{ label: 'Review', prompt: 'Review PR {pr} for {key}' }] },
      cardKey: 'DIG-44',
      pr: withPr,
      worktreeExists: true,
      send,
    });
    // when
    list[0].onClick();
    // then
    expect(send).toHaveBeenCalledWith(want);
  });

  test('a config with no actions gives no buttons', () => {
    // when
    const list = cardActions({
      config: { ...config, actions: [] },
      cardKey: 'DIG-44',
      pr,
      worktreeExists: true,
      send: vi.fn(),
    });
    // then
    expect(list).toEqual([]);
  });
});
