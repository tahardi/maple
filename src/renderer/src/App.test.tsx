import { act, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { useMaple } from './store';
import { fakeMaple } from './testing/fakeMaple';

vi.mock('./claude/ClaudePane', () => ({
  ClaudePane: () => <div data-testid="claude-pane" />,
}));

describe('App', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('shows the Home tab of the first project', async () => {
    // given
    const sprint = vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null }));
    fakeMaple({ jira: { sprint } });
    // when
    render(<App />);
    // then
    expect(await screen.findByText('No active sprint')).toBeInTheDocument();
    expect(sprint).toHaveBeenCalledWith('BEAR');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('switching project shows that project board', async () => {
    // given
    const sprint = vi.fn(() => Promise.resolve({ data: null, error: null, fetchedAt: null }));
    fakeMaple({ jira: { sprint } });
    render(<App />);
    await screen.findByText('No active sprint');
    // when
    act(() => {
      useMaple.getState().selectProject('DIG');
    });
    // then
    await waitFor(() => {
      expect(sprint).toHaveBeenLastCalledWith('DIG');
    });
  });

  test('shows Home when tabs fail to load', async () => {
    // given
    fakeMaple({
      tabs: {
        list: () => Promise.reject(new Error('listing tabs: not implemented')),
        statuses: () => Promise.reject(new Error('listing statuses: not implemented')),
      },
    });
    // when
    render(<App />);
    // then
    expect(await screen.findByTestId('home')).toBeInTheDocument();
  });

  test('shows a config error with the reload hint', async () => {
    // given
    fakeMaple({
      config: {
        get: () =>
          Promise.resolve({ data: null, error: 'reading config: projects must not be empty', fetchedAt: null }),
      },
    });
    // when
    render(<App />);
    // then
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('reading config: projects must not be empty');
    expect(banner).toHaveTextContent('Fix ~/.config/maple/config.json, then Reload config (Ctrl+Shift+R)');
  });

  test('shows every preflight problem', async () => {
    // given
    fakeMaple({
      preflight: {
        run: () =>
          Promise.resolve([
            { tool: 'gh', message: 'gh is not installed' },
            { tool: 'jira-env', message: 'Jira credentials are missing' },
          ]),
      },
    });
    // when
    render(<App />);
    // then
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('gh is not installed');
    expect(banner).toHaveTextContent('Jira credentials are missing');
  });

  test('shows state and restore warnings', async () => {
    // given
    const warnings = ['reading state: state.json is unreadable', 'dropped DIG-44: project DIG is not in config'];
    fakeMaple({ app: { warnings: () => Promise.resolve(warnings) } });
    // when
    render(<App />);
    // then
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('reading state: state.json is unreadable');
    expect(banner).toHaveTextContent('dropped DIG-44: project DIG is not in config');
  });

  test('shows Home when warnings fail to load', async () => {
    // given
    fakeMaple({ app: { warnings: () => Promise.reject(new Error('invoking app:warnings: gone')) } });
    // when
    render(<App />);
    // then
    expect(await screen.findByText('No active sprint')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows preflight problems and a config error in one banner', async () => {
    // given
    fakeMaple({
      config: { get: () => Promise.resolve({ data: null, error: 'reading config: bad json', fetchedAt: null }) },
      preflight: { run: () => Promise.resolve([{ tool: 'gh', message: 'gh is not installed' }]) },
    });
    // when
    render(<App />);
    // then
    const banner = await screen.findByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(banner).toHaveTextContent('gh is not installed');
    expect(banner).toHaveTextContent('reading config: bad json');
  });

  test('shows the active card tab', async () => {
    // given
    fakeMaple({
      tabs: {
        list: () =>
          Promise.resolve([
            { id: 't1', projectKey: 'BEAR', kind: 'card', cardKey: 'BEAR-1', sessionId: 's1', worktreePath: null },
          ]),
      },
    });
    render(<App />);
    await screen.findByTestId('home');
    // when
    useMaple.getState().activate('t1');
    // then
    expect(await screen.findByTestId('card-tab')).toHaveTextContent('BEAR-1');
  });
});
