import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapleApi } from '@shared/api/mapleApi';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import type { FindingLesson } from '@shared/types/findings/findingLesson';
import { useMaple } from '@renderer/store';
import { FAKE_CONFIG, fakeMaple } from '@renderer/testing/fakeMaple';
import { finding } from '@renderer/testing/findingsFixture';
import { LearnButtons } from './LearnButtons';

const NOTE = 'Learning/Security/command-injection.md';

function tabOf(id: string, kind: TabState['kind'], cardKey: string | null): TabState {
  return { id, projectKey: 'MPL', kind, cardKey, sessionId: `s-${id}`, worktreePath: null, worktreePaths: [] };
}

function statusOf(tabId: string, dot: TabStatus['dot']): TabStatus {
  return { tabId, dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null };
}

function setup(vaultDir: string | null = '/vault', tabs: TabState[] = [tabOf('t1', 'card', 'MPL-20')]) {
  const fromFinding = vi.fn<MapleApi['learning']['fromFinding']>(() =>
    Promise.resolve({ note: NOTE, learningTabId: 'learn-1' }),
  );
  const setActive = vi.fn();
  fakeMaple({ learning: { fromFinding }, tabs: { setActive } });
  useMaple.setState({
    config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir } },
    tabs,
  });
  return { fromFinding, setActive };
}

const lessonOf = (mode: FindingLesson['mode']): FindingLesson => ({ note: NOTE, mode, at: '2026-11-13T12:00:00Z' });

describe('LearnButtons', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test.each<{ label: string; mode: FindingLesson['mode'] }>([
    { label: 'Learn now', mode: 'now' },
    { label: 'Learn later', mode: 'later' },
  ])('$label calls fromFinding', async ({ label, mode }) => {
    // given
    const { fromFinding } = setup();
    render(<LearnButtons tabId="t1" finding={finding()} working={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: label }));
    // then
    expect(fromFinding).toHaveBeenCalledWith('t1', 'F1', mode);
  });

  test.each<{
    name: string;
    working: boolean;
    learningDot: TabStatus['dot'];
    now: string | null;
    later: string | null;
  }>([
    {
      name: 'the card is working',
      working: true,
      learningDot: 'idle',
      now: 'Claude is working',
      later: 'Claude is working',
    },
    {
      name: 'the Learning session is working',
      working: false,
      learningDot: 'working',
      now: 'The Learning session is busy',
      later: null,
    },
  ])('disables the buttons with a reason when $name', ({ working, learningDot, now, later }) => {
    // given
    setup('/vault', [tabOf('t1', 'card', 'MPL-20'), tabOf('learn-1', 'learning', null)]);
    useMaple.setState({ statuses: { 'learn-1': statusOf('learn-1', learningDot) } });
    // when
    render(<LearnButtons tabId="t1" finding={finding()} working={working} />);
    // then
    expect(screen.getByRole('button', { name: 'Learn now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Learn later' }).hasAttribute('disabled')).toBe(later !== null);
    for (const reason of [now, later].filter((r) => r !== null)) {
      expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    }
  });

  test('shows nothing without a vaultDir', () => {
    // given
    setup(null);
    // when
    render(<LearnButtons tabId="t1" finding={finding()} working={false} />);
    // then
    expect(screen.queryByRole('button', { name: 'Learn now' })).not.toBeInTheDocument();
  });

  test('shows Open lesson once the lesson is saved and keeps Learn now after Learn later', () => {
    // given
    setup();
    // when
    const { rerender } = render(
      <LearnButtons tabId="t1" finding={finding({ lesson: lessonOf('later') })} working={false} />,
    );
    const afterLater = {
      now: screen.queryByRole('button', { name: 'Learn now' }) !== null,
      later: screen.queryByRole('button', { name: 'Learn later' }) !== null,
    };
    rerender(<LearnButtons tabId="t1" finding={finding({ lesson: lessonOf('now') })} working={false} />);
    // then
    expect(afterLater).toEqual({ now: true, later: false });
    expect(screen.getByText('Lesson saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open lesson' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Learn now' })).not.toBeInTheDocument();
  });

  test('Learn now opens the Learning tab on the note', async () => {
    // given
    const { setActive } = setup();
    render(<LearnButtons tabId="t1" finding={finding()} working={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Learn now' }));
    // then
    await waitFor(() => {
      expect(useMaple.getState().activeTabId).toBe('learn-1');
    });
    expect(useMaple.getState().lessonNote).toBe(NOTE);
    expect(setActive).toHaveBeenCalledWith('learn-1');
  });

  test('Open lesson opens the Learning tab when none is open', async () => {
    // given
    setup();
    render(<LearnButtons tabId="t1" finding={finding({ lesson: lessonOf('later') })} working={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Open lesson' }));
    // then
    await waitFor(() => {
      expect(useMaple.getState().activeTabId).toBe('learning-MPL');
    });
    expect(useMaple.getState().lessonNote).toBe(NOTE);
  });

  test('shows the error when saving fails', async () => {
    // given
    const { fromFinding } = setup();
    fromFinding.mockRejectedValueOnce(new Error('starting lesson: the Learning session is not running'));
    render(<LearnButtons tabId="t1" finding={finding()} working={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Learn now' }));
    // then
    expect(await screen.findByText(/the Learning session is not running/)).toBeInTheDocument();
  });
});
