import type { Dot, MapleConfig, PrInfo } from '@shared/types';
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
  checks: { passed: 3, failed: 0, pending: 0, total: 3 },
};

function actions(overrides: { pr?: PrInfo | null; dot?: Dot; worktreeExists?: boolean; reading?: boolean } = {}) {
  const send = vi.fn();
  const approve = vi.fn();
  const secondRead = vi.fn();
  const list = cardActions({
    config,
    cardKey: 'DIG-44',
    pr: overrides.pr === undefined ? pr : overrides.pr,
    dot: overrides.dot ?? 'ready',
    worktreeExists: overrides.worktreeExists ?? true,
    reading: overrides.reading ?? false,
    send,
    approve,
    secondRead,
  });
  return { list, send, approve, secondRead };
}

describe('cardActions', () => {
  test('gives one button per config action, then Second read, then Approve', () => {
    // given
    const { list } = actions();
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Address review', 'Merge main', 'Second read', 'Approve']);
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
    expect(list.filter((a) => a.disabled && a.label !== 'Second read')).toHaveLength(1);
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
      dot: 'ready',
      worktreeExists: true,
      reading: false,
      send,
      approve: vi.fn(),
      secondRead: vi.fn(),
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
    const { list } = actions({ pr: { ...pr, checks: { passed: 1, failed: 0, pending: 2, total: 3 } } });
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

  test('a config with no actions gives only Second read and Approve', () => {
    // given
    const list = cardActions({
      config: { ...config, actions: [] },
      cardKey: 'DIG-44',
      pr,
      dot: 'ready',
      worktreeExists: true,
      reading: false,
      send: vi.fn(),
      approve: vi.fn(),
      secondRead: vi.fn(),
    });
    // when
    const labels = list.map((a) => a.label);
    // then
    expect(labels).toEqual(['Second read', 'Approve']);
  });

  test('Second read calls secondRead', () => {
    // given
    const { list, secondRead } = actions();
    // when
    list.find((a) => a.label === 'Second read')?.onClick();
    // then
    expect(secondRead).toHaveBeenCalledOnce();
  });

  test.each([
    { name: 'there is no PR', overrides: { pr: null }, want: { label: 'Second read', title: 'No open PR' } },
    {
      name: 'the PR is merged',
      overrides: { pr: { ...pr, state: 'MERGED' as const } },
      want: { label: 'Second read', title: 'No open PR' },
    },
    { name: 'a read runs', overrides: { reading: true }, want: { label: 'Reading…' } },
    {
      name: 'there is no worktree',
      overrides: { worktreeExists: false },
      want: { label: 'Second read', title: 'No worktree' },
    },
  ])('Second read is disabled when $name', ({ overrides, want }) => {
    // given
    const { list } = actions(overrides);
    // when
    const button = list.at(-2);
    // then
    expect(button).toMatchObject({ ...want, disabled: true });
  });

  test.each([
    { name: 'the agent is working', overrides: { dot: 'working' as const } },
    {
      name: 'checks are failing',
      overrides: { pr: { ...pr, checks: { passed: 2, failed: 1, pending: 0, total: 3 } } },
    },
  ])('Second read stays enabled when $name', ({ overrides }) => {
    // given
    const { list } = actions(overrides);
    // when
    const button = list.find((a) => a.label === 'Second read');
    // then
    expect(button?.disabled).toBeUndefined();
  });
});
