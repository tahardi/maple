import type { TabState } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { TabBar } from './TabBar';

const tab = (id: string, projectKey: string, kind: TabState['kind'], cardKey: string | null): TabState => ({
  id,
  projectKey,
  kind,
  cardKey,
  sessionId: `s-${id}`,
  worktreePath: null,
});

describe('TabBar', () => {
  beforeEach(() => {
    fakeMaple();
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({
      config: FAKE_CONFIG,
      projectKey: 'BEAR',
      tabs: [
        tab('t1', 'BEAR', 'card', 'BEAR-1'),
        tab('t2', 'BEAR', 'card', 'BEAR-2'),
        tab('t3', 'BEAR', 'planner', null),
        tab('t4', 'DIG', 'card', 'DIG-1'),
      ],
    });
  });

  test('shows Home and the selected project card tabs only', () => {
    // given
    render(<TabBar />);
    // when
    const labels = screen.getAllByRole('tab').map((t) => t.textContent);
    // then
    expect(labels).toEqual(['Home', 'BEAR-1', 'BEAR-2']);
  });

  test('clicking a tab activates it', async () => {
    // given
    const activate = vi.fn();
    useMaple.setState({ activate });
    render(<TabBar />);
    // when
    await userEvent.click(screen.getByRole('tab', { name: 'BEAR-2' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Home' }));
    // then
    expect(activate.mock.calls).toEqual([['t2'], [null]]);
  });
});
