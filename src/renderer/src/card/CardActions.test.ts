import type { Dot, MapleConfig, PrInfo } from '@shared/types';
import { cardActions } from './CardActions';

const config: MapleConfig = {
  worktreesDir: '/tmp/wts',
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
  checks: { passed: 3, failed: 0, pending: 0, total: 3 },
};

function actions(overrides: { pr?: PrInfo | null; dot?: Dot; worktreeExists?: boolean } = {}) {
  const send = vi.fn();
  const approve = vi.fn();
  const list = cardActions({
    config,
    cardKey: 'DIG-44',
    pr: overrides.pr === undefined ? pr : overrides.pr,
    dot: overrides.dot ?? 'ready',
    worktreeExists: overrides.worktreeExists ?? true,
    send,
    approve,
  });
  return { list, send, approve };
}

describe('cardActions', () => {
  test('gives one button per config action, then Approve', () => {
    // given
    const { list } = actions();
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Address review', 'Merge main', 'Approve']);
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

  test.each([
    { name: 'the agent is working', overrides: { dot: 'working' as const }, title: 'Agent is working' },
    { name: 'there is no PR', overrides: { pr: null }, title: 'No open PR' },
    { name: 'the PR is merged', overrides: { pr: { ...pr, state: 'MERGED' as const } }, title: 'No open PR' },
    {
      name: 'checks are failing',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3 } } },
      title: 'Checks are failing',
    },
  ])('Approve is disabled when $name', ({ overrides, title }) => {
    // given
    const { list } = actions(overrides);
    // when
    const approve = list.find((a) => a.label === 'Approve');
    // then
    expect(approve).toMatchObject({ disabled: true, title });
    expect(list.filter((a) => a.disabled)).toHaveLength(1);
  });

  test('every button is disabled without a worktree', () => {
    // given
    const { list } = actions({ worktreeExists: false });
    // when
    const states = list.map((a) => ({ disabled: a.disabled, title: a.title }));
    // then
    expect(states).toEqual(Array(3).fill({ disabled: true, title: 'No worktree' }));
  });
});
