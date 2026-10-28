import type { Dot } from '@shared/types/tabs';
import type { MapleConfig } from '@shared/types/config';
import type { PrInfo, Review } from '@shared/types/github';
import { cardActions } from './CardActions';

const config: MapleConfig = {
  worktreesDir: '/tmp/wts',
  vaultDir: null,
  notifications: false,
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
  checks: { passed: 3, failed: 0, pending: 0, total: 3, runs: [] },
};

const review: Review = { number: 7, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), files: [], findings: [] };

function actions(overrides: { pr?: PrInfo | null; review?: Review | null; dot?: Dot; worktreeExists?: boolean } = {}) {
  const send = vi.fn();
  const approve = vi.fn();
  const close = vi.fn();
  const list = cardActions({
    config,
    cardKey: 'DIG-44',
    pr: overrides.pr === undefined ? pr : overrides.pr,
    review: overrides.review === undefined ? review : overrides.review,
    dot: overrides.dot ?? 'ready',
    worktreeExists: overrides.worktreeExists ?? true,
    send,
    approve,
    close,
  });
  return { list, send, approve, close };
}

describe('cardActions', () => {
  test('gives one button per config action, then Approve and Close', () => {
    // given
    const { list } = actions();
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Address review', 'Merge main', 'Approve', 'Close']);
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

  test('Approve calls approve', () => {
    // given
    const { list, approve } = actions();
    // when
    list.find((a) => a.label === 'Approve')?.onClick();
    // then
    expect(approve).toHaveBeenCalledOnce();
  });

  test('Close calls close', () => {
    // given
    const { list, close } = actions();
    // when
    list.find((a) => a.label === 'Close')?.onClick();
    // then
    expect(close).toHaveBeenCalledOnce();
  });

  test.each([
    { name: 'the agent is working', overrides: { dot: 'working' as const }, title: 'Agent is working' },
    { name: 'the PR is merged', overrides: { pr: { ...pr, state: 'MERGED' as const } }, title: 'PR is merged' },
    {
      name: 'the agent is working on a merged PR',
      overrides: { dot: 'working' as const, pr: { ...pr, state: 'MERGED' as const } },
      title: 'Agent is working',
    },
  ])('Close is disabled when $name', ({ overrides, title }) => {
    // given
    const { list } = actions(overrides);
    // when
    const close = list.find((a) => a.label === 'Close');
    // then
    expect(close).toMatchObject({ disabled: true, title });
  });

  test.each([
    { name: 'there is no PR', overrides: { pr: null } },
    { name: 'the PR is open', overrides: { pr } },
    { name: 'the PR is closed', overrides: { pr: { ...pr, state: 'CLOSED' as const } } },
    {
      name: 'checks are failing',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } } },
    },
  ])('Close is enabled when $name', ({ overrides }) => {
    // given
    const { list } = actions(overrides);
    // when
    const close = list.find((a) => a.label === 'Close');
    // then
    expect(close?.disabled).toBeUndefined();
  });

  test.each([
    { name: 'the agent is working', overrides: { dot: 'working' as const }, title: 'Agent is working' },
    { name: 'there is no PR', overrides: { pr: null }, title: 'No open PR' },
    { name: 'the PR is merged', overrides: { pr: { ...pr, state: 'MERGED' as const } }, title: 'No open PR' },
    {
      name: 'checks are failing',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } } },
      title: 'Checks are failing',
    },
    { name: 'the review is not loaded', overrides: { review: null }, title: 'Review not loaded' },
  ])('Approve is disabled when $name', ({ overrides, title }) => {
    // given
    const { list } = actions(overrides);
    // when
    const approve = list.find((a) => a.label === 'Approve');
    // then
    expect(approve).toMatchObject({ disabled: true, title });
    expect(list.filter((a) => a.disabled && a.label !== 'Close')).toHaveLength(1);
  });

  test('every button is disabled without a worktree', () => {
    // given
    const { list } = actions({ worktreeExists: false });
    // when
    const states = list.map((a) => ({ disabled: a.disabled, title: a.title }));
    // then
    expect(states).toEqual(Array(4).fill({ disabled: true, title: 'No worktree' }));
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
      send,
      approve: vi.fn(),
      close: vi.fn(),
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
    const approve = list.find((a) => a.label === 'Approve');
    // then
    expect(approve?.disabled).toBeUndefined();
  });

  test('Approve is enabled while checks are only pending', () => {
    // given
    const { list } = actions({ pr: { ...pr, checks: { passed: 1, failed: 0, pending: 2, total: 3, runs: [] } } });
    // when
    const approve = list.find((a) => a.label === 'Approve');
    // then
    expect(approve?.disabled).toBeUndefined();
  });

  test.each([
    { name: 'working beats no PR', overrides: { dot: 'working' as const, pr: null }, title: 'Agent is working' },
    {
      name: 'no worktree beats working',
      overrides: { dot: 'working' as const, worktreeExists: false },
      title: 'No worktree',
    },
  ])('Approve shows one reason: $name', ({ overrides, title }) => {
    // given
    const { list } = actions(overrides);
    // when
    const approve = list.find((a) => a.label === 'Approve');
    // then
    expect(approve?.title).toBe(title);
  });

  test('failing checks show before a missing review', () => {
    // given
    const failing = { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3, runs: [] } };
    const { list } = actions({ pr: failing, review: null });
    // when
    const approve = list.find((a) => a.label === 'Approve');
    // then
    expect(approve?.title).toBe('Checks are failing');
  });

  test('a config with no actions gives only Approve and Close', () => {
    // given
    const list = cardActions({
      config: { ...config, actions: [] },
      cardKey: 'DIG-44',
      pr,
      review,
      dot: 'ready',
      worktreeExists: true,
      send: vi.fn(),
      approve: vi.fn(),
      close: vi.fn(),
    });
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Approve', 'Close']);
  });
});
