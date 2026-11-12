import type { TabState } from '@shared/types/tabs/tabState';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
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
});
