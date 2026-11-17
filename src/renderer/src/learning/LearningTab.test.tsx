import type { TabState } from '@shared/types/tabs/tabState';
import type { LessonSummary } from '@shared/types/learning/lessonSummary';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { fullLesson } from '@renderer/testing/fullLessonFixture';
import { lesson } from '@renderer/testing/lessonFixture';
import { LearningTab } from './LearningTab';

vi.mock('@renderer/card/viewer/editor/monacoSetup', () => ({}));

vi.mock('../claude/ClaudePane', () => ({
  ClaudePane: ({ tabId }: { tabId: string }) => <div data-testid="claude-pane">{tabId}</div>,
}));

vi.mock('@monaco-editor/react', () => ({
  useMonaco: () => null,
  Editor: () => <div data-testid="editor" />,
  DiffEditor: () => <div data-testid="diff-editor" />,
}));

const learningTab: TabState = {
  id: 'l1',
  projectKey: 'BEAR',
  kind: 'learning',
  cardKey: null,
  sessionId: 's-l1',
  worktreePath: null,
  worktreePaths: [],
};

describe('LearningTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useMaple.setState(useMaple.getInitialState(), true);
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver() {
        return { observe: vi.fn(), disconnect: vi.fn() };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('opens the selected note in the viewer', async () => {
    // given
    const read = vi.fn(() => Promise.resolve('# Cross-site scripting\n'));
    fakeMaple({
      learning: { list: () => Promise.resolve([lesson('xss', { title: 'XSS' })]) },
      vault: { read },
    });
    render(<LearningTab tab={learningTab} />);
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'XSS' }));
    // then
    expect(await screen.findByRole('heading', { name: 'Cross-site scripting' })).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('Learning/Security/xss.md');
  });

  test('shows the lesson page for a note with a lesson and the viewer otherwise', async () => {
    // given
    const read = vi.fn(() => Promise.resolve('# Cross-site scripting\n'));
    const readLesson = vi.fn(() => Promise.resolve(fullLesson('cmd', { quiz: null, quizError: 'x' })));
    fakeMaple({
      learning: {
        list: () =>
          Promise.resolve([
            lesson('xss', { title: 'XSS' }),
            lesson('cmd', { title: 'Command injection', hasLesson: true }),
          ]),
        read: readLesson,
      },
      vault: { read },
    });
    render(<LearningTab tab={learningTab} />);
    // when
    await userEvent.click(await screen.findByRole('button', { name: 'Command injection' }));
    // then
    expect(await screen.findByRole('heading', { name: 'What it is' })).toBeInTheDocument();
    expect(readLesson).toHaveBeenCalledWith('Learning/Security/cmd.md');
    expect(read).not.toHaveBeenCalled();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'XSS' }));
    // then
    expect(await screen.findByRole('heading', { name: 'Cross-site scripting' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What it is' })).not.toBeInTheDocument();
  });

  test('shows the Claude pane for the tab', () => {
    // given
    fakeMaple();
    // when
    render(<LearningTab tab={learningTab} />);
    // then
    expect(within(screen.getByTestId('claude-slot')).getByTestId('claude-pane')).toHaveTextContent('l1');
  });

  test('shows why the lessons could not be listed', async () => {
    // given
    fakeMaple({ learning: { list: () => Promise.reject(new Error('reading lessons: no vaultDir in config')) } });
    // when
    render(<LearningTab tab={learningTab} />);
    // then
    expect(await screen.findByText('reading lessons: no vaultDir in config')).toBeInTheDocument();
    expect(screen.queryByText(/^No lessons yet/)).not.toBeInTheDocument();
  });

  test('keeps the listed lessons and shows the error when a reload fails', async () => {
    // given
    const changed = { value: (): void => undefined };
    const list = vi
      .fn<() => Promise<LessonSummary[]>>()
      .mockResolvedValueOnce([lesson('xss', { title: 'XSS' })])
      .mockRejectedValueOnce(new Error('reading lessons: no vaultDir in config'));
    fakeMaple({
      learning: { list },
      vault: {
        onChanged: (cb) => {
          changed.value = cb;
          return vi.fn();
        },
      },
    });
    render(<LearningTab tab={learningTab} />);
    await screen.findByRole('button', { name: 'XSS' });
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await screen.findByText('reading lessons: no vaultDir in config')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'XSS' })).toBeInTheDocument();
  });
});
