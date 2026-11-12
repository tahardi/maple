import type { Dot } from '@shared/types/tabs/dot';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { PrInfo } from '@shared/types/github/prInfo';
import type { Review } from '@shared/types/github/review';
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
  checks: { passed: 3, failed: 0, pending: 0, total: 3, runs: [] },
};

const review: Review = {
  number: 7,
  headSha: 'a'.repeat(40),
  baseSha: 'b'.repeat(40),
  added: 0,
  removed: 0,
  files: [],
  findings: [],
};

type Overrides = {
  pr?: PrInfo | null;
  review?: Review | null;
  dot?: Dot;
  worktreeExists?: boolean;
  approving?: boolean;
};

function actions(overrides: Overrides = {}) {
  const send = vi.fn();
  const approve = vi.fn();
  const reloadReview = vi.fn();
  const list = cardActions({
    config,
    cardKey: 'DIG-44',
    pr: overrides.pr === undefined ? pr : overrides.pr,
    review: overrides.review === undefined ? review : overrides.review,
    dot: overrides.dot ?? 'ready',
    worktreeExists: overrides.worktreeExists ?? true,
    approving: overrides.approving ?? false,
    send,
    approve,
    reloadReview,
  });
  return { list, send, approve, reloadReview };
}

describe('cardActions', () => {
  test('gives one button per config action, then Approve & merge', () => {
    // given
    const { list } = actions();
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Address review', 'Merge main', 'Approve & merge']);
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

  test('Approve is primary', () => {
    // given
    const { list } = actions();
    // when
    const variants = list.map((a) => a.variant);
    // then
    expect(variants).toEqual([undefined, undefined, 'primary']);
  });

  test('Approve calls approve', () => {
    // given
    const { list, approve } = actions();
    // when
    list.find((a) => a.label === 'Approve & merge')?.onClick();
    // then
    expect(approve).toHaveBeenCalledOnce();
  });

  test.each([
    { name: 'the agent is working', overrides: { dot: 'working' as const }, reason: 'Agent is working' },
    { name: 'there is no PR', overrides: { pr: null }, reason: 'No open PR' },
    { name: 'the PR is merged', overrides: { pr: { ...pr, state: 'MERGED' as const } }, reason: 'No open PR' },
    {
      name: 'checks are failing',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } } },
      reason: 'Checks are failing',
    },
    { name: 'the review is not loaded', overrides: { review: null }, reason: 'Review not loaded' },
    {
      name: 'the PR has new commits',
      overrides: { pr: { ...pr, headSha: 'c'.repeat(40) } },
      reason: 'PR has new commits',
    },
  ])('Approve is disabled when $name', ({ overrides, reason }) => {
    // given
    const { list } = actions(overrides);
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve).toMatchObject({ disabled: true, reason });
    expect(list.filter((a) => a.disabled)).toHaveLength(1);
  });

  test('without a worktree every button is disabled and Approve & merge says No worktree', () => {
    // given
    const { list } = actions({ worktreeExists: false });
    // when
    const states = list.map((a) => ({ disabled: a.disabled, reason: a.reason }));
    // then
    expect(states).toEqual([
      { disabled: true, reason: undefined },
      { disabled: true, reason: undefined },
      { disabled: true, reason: 'No worktree' },
    ]);
  });

  test.each([
    { name: 'the review is not loaded', overrides: { review: null } },
    { name: 'the PR has new commits', overrides: { pr: { ...pr, headSha: 'c'.repeat(40) } } },
  ])('Approve & merge offers Reload review when $name', ({ overrides }) => {
    // given
    const { list, reloadReview } = actions(overrides);
    const approve = list.find((a) => a.label === 'Approve & merge');
    // when
    approve?.fix?.onClick();
    // then
    expect(approve?.fix?.label).toBe('Reload review');
    expect(reloadReview).toHaveBeenCalledOnce();
  });

  test.each([
    { name: 'the agent is working', overrides: { dot: 'working' as const } },
    { name: 'checks are failing', overrides: { pr: { ...pr, checks: { ...pr.checks, failed: 1 } } } },
    { name: 'nothing blocks it', overrides: {} },
  ])('Approve & merge offers no fix when $name', ({ overrides }) => {
    // given
    const { list } = actions(overrides);
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve?.fix).toBeUndefined();
  });

  test('Approve & merge shows Merging… while approving', () => {
    // given
    const { list } = actions({ approving: true });
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve).toMatchObject({ busy: true, busyLabel: 'Merging…' });
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
      review,
      dot: 'ready',
      worktreeExists: true,
      approving: false,
      send,
      approve: vi.fn(),
      reloadReview: vi.fn(),
    });
    // when
    list[0].onClick();
    // then
    expect(send).toHaveBeenCalledWith(want);
  });

  test.each(['waiting', 'ready', 'idle'] as const)('Approve is enabled when the dot is %s', (dot) => {
    // given
    const { list } = actions({ dot });
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve?.disabled).toBeUndefined();
  });

  test('Approve is enabled while checks are only pending', () => {
    // given
    const { list } = actions({ pr: { ...pr, checks: { passed: 1, failed: 0, pending: 2, total: 3, runs: [] } } });
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve?.disabled).toBeUndefined();
  });

  test.each([
    { name: 'working beats no PR', overrides: { dot: 'working' as const, pr: null }, reason: 'Agent is working' },
    {
      name: 'no worktree beats working',
      overrides: { dot: 'working' as const, worktreeExists: false },
      reason: 'No worktree',
    },
  ])('Approve shows one reason: $name', ({ overrides, reason }) => {
    // given
    const { list } = actions(overrides);
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve?.reason).toBe(reason);
  });

  test('failing checks show before a missing review', () => {
    // given
    const failing = { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } };
    const { list } = actions({ pr: failing, review: null });
    // when
    const approve = list.find((a) => a.label === 'Approve & merge');
    // then
    expect(approve?.reason).toBe('Checks are failing');
  });

  test('a config with no actions gives only Approve', () => {
    // given
    const list = cardActions({
      config: { ...config, actions: [] },
      cardKey: 'DIG-44',
      pr,
      review,
      dot: 'ready',
      worktreeExists: true,
      approving: false,
      send: vi.fn(),
      approve: vi.fn(),
      reloadReview: vi.fn(),
    });
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Approve & merge']);
  });
});
